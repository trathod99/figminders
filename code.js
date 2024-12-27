figma.showUI(__html__, { width: 600, height: 600 });

// Function to send preview of selected node
async function sendSelectionPreview() {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
        const selectedNode = selection[0];
        const imageData = await selectedNode.exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 384 }
        });
        
        figma.ui.postMessage({
            type: 'selection-preview',
            preview: figma.base64Encode(imageData)
        });
    } else {
        figma.ui.postMessage({
            type: 'selection-preview',
            preview: null
        });
    }
}

// Listen for selection changes
figma.on('selectionchange', () => {
    sendSelectionPreview();
});

// Send initial selection preview AND todos
sendSelectionPreview();
const initialTodos = figma.root.getPluginData('todos') 
    ? JSON.parse(figma.root.getPluginData('todos')) 
    : [];
figma.ui.postMessage({
    type: 'todos-updated',
    todos: initialTodos
});

figma.ui.onmessage = async function (msg) {
    if (msg.type === 'add-todo') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.ui.postMessage({ 
                type: 'no-selection',
                message: 'Please select an object first'
            });
            return;
        }

        const selectedNode = selection[0];
        
        // Create a preview image of the selected node
        const imageData = await selectedNode.exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 384 }
        });

        // Store the node ID and todo text
        const nodeId = selectedNode.id;
        const nodeName = selectedNode.name;
        const todoText = msg.text;
        
        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            
            todos.unshift({
                id: Date.now(),
                nodeId: nodeId,
                nodeName: nodeName,
                text: todoText,
                completed: false,
                preview: figma.base64Encode(imageData)
            });
            
            figma.root.setPluginData('todos', JSON.stringify(todos));
            
            // Send updated todos back to UI
            figma.ui.postMessage({
                type: 'todos-updated',
                todos: todos
            });
        } catch (error) {
            console.error('Error saving todo:', error);
        }
    }
    
    if (msg.type === 'toggle-todo') {
        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            const todo = todos.find(t => t.id === msg.todoId);
            if (todo) {
                todo.completed = msg.completed;
                figma.root.setPluginData('todos', JSON.stringify(todos));
                figma.ui.postMessage({
                    type: 'todos-updated',
                    todos: todos
                });
            }
        } catch (error) {
            console.error('Error updating todo:', error);
        }
    }

    if (msg.type === 'close-plugin') {
        figma.closePlugin();
    }

    if (msg.type === 'delete-todo') {
        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            const updatedTodos = todos.filter(todo => todo.id !== msg.todoId);
            figma.root.setPluginData('todos', JSON.stringify(updatedTodos));
            
            figma.ui.postMessage({
                type: 'todos-updated',
                todos: updatedTodos
            });
        } catch (error) {
            console.error('Error deleting todo:', error);
        }
    }

    if (msg.type === 'update-todo-text') {
        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            const todo = todos.find(t => t.id === msg.todoId);
            if (todo) {
                todo.text = msg.text;
                figma.root.setPluginData('todos', JSON.stringify(todos));
                figma.ui.postMessage({
                    type: 'todos-updated',
                    todos: todos
                });
            }
        } catch (error) {
            console.error('Error updating todo text:', error);
        }
    }

    if (msg.type === 'select-node') {
        try {
            const node = figma.getNodeById(msg.nodeId);
            if (node) {
                // Select the node
                figma.currentPage.selection = [node];
                
                // Scroll viewport to show the node
                figma.viewport.scrollAndZoomIntoView([node]);
            }
        } catch (error) {
            console.error('Error selecting node:', error);
            figma.ui.postMessage({
                type: 'error',
                message: 'Could not find the original object'
            });
        }
    }

    if (msg.type === 'get-node-hierarchy') {
        try {
            const relationships = getNodeRelationships(msg.nodeId);
            figma.ui.postMessage({
                type: 'node-hierarchy',
                relationships: relationships,
                nodeId: msg.nodeId
            });
        } catch (error) {
            console.error('Error getting node hierarchy:', error);
        }
    }

    if (msg.type === 'organize-smart-groups') {
        try {
            const groups = organizeSmartGroups(msg.todos);
            figma.ui.postMessage({
                type: 'smart-groups-ready',
                groups: Array.from(groups.entries())
            });
        } catch (error) {
            console.error('Error organizing smart groups:', error);
        }
    }
};

// Add this new function to get node relationships
function getNodeRelationships(nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node) {
        console.log(`❌ Node not found for ID: ${nodeId}`);
        return null;
    }
    
    console.log(`📍 Getting relationships for node: "${node.name}" (ID: ${nodeId})`);
    
    const relationships = {
        nodeId: nodeId,
        parentId: node.parent ? node.parent.id : null,
        childrenIds: [],
        siblingIds: []
    };
    
    // Get children IDs
    if ('children' in node) {
        relationships.childrenIds = node.children.map(child => child.id);
        console.log(`  👇 Children IDs: [${relationships.childrenIds.join(', ')}]`);
    }
    
    // Get sibling IDs
    if (node.parent && 'children' in node.parent) {
        relationships.siblingIds = node.parent.children
            .filter(sibling => sibling.id !== nodeId)
            .map(sibling => sibling.id);
        console.log(`  👥 Sibling IDs: [${relationships.siblingIds.join(', ')}]`);
    }
    
    return relationships;
}

function areNodesRelated(node1Id, node2Id) {
    const rel1 = getNodeRelationships(node1Id);
    const rel2 = getNodeRelationships(node2Id);
    if (!rel1 || !rel2) {
        console.log(`❌ Couldn't get relationships for comparison between ${node1Id} and ${node2Id}`);
        return false;
    }

    // Check parent-child relationship
    if (rel1.children.includes(node2Id)) {
        console.log(`✅ Node ${node1Id} is a parent of ${node2Id}`);
        return true;
    }
    if (rel2.children.includes(node1Id)) {
        console.log(`✅ Node ${node2Id} is a parent of ${node1Id}`);
        return true;
    }
    
    // Check sibling relationship
    if (rel1.parent === rel2.parent && rel1.parent !== null) {
        console.log(`✅ Nodes ${node1Id} and ${node2Id} are siblings`);
        return true;
    }
    
    console.log(`❌ No relationship found between ${node1Id} and ${node2Id}`);
    return false;
}

// Add this function to organize todos by hierarchy
function organizeSmartGroups(todos) {
    console.log('🔄 Starting Smart Group organization');
    console.log(`📋 Processing ${todos.length} todos`);
    
    const groups = new Map();
    const processedNodes = new Set();

    // First pass: find parent-child relationships
    todos.forEach((todo1, index) => {
        if (processedNodes.has(todo1.nodeId)) {
            console.log(`⏭️ Skipping processed nodeId: ${todo1.nodeId}`);
            return;
        }

        console.log(`\n🔍 Checking relationships for nodeId: ${todo1.nodeId}`);
        const relationships = getNodeRelationships(todo1.nodeId);
        if (!relationships) return;

        // Find todos that are children of this node
        const childTodos = todos.filter(todo2 => 
            todo2.nodeId !== todo1.nodeId && 
            relationships.childrenIds.includes(todo2.nodeId)
        );

        if (childTodos.length > 0) {
            console.log(`  📎 Creating group with ${childTodos.length} child todos`);
            console.log(`  Parent NodeId: ${todo1.nodeId}`);
            console.log(`  Children NodeIds: [${childTodos.map(t => t.nodeId).join(', ')}]`);
            
            groups.set(todo1.nodeId, childTodos);
            processedNodes.add(todo1.nodeId);
            childTodos.forEach(child => processedNodes.add(child.nodeId));
        }
    });

    // Debug the groups Map
    console.log('\n📊 Groups Map contents:');
    groups.forEach((children, parentNodeId) => {
        console.log(`  Parent NodeId: ${parentNodeId}`);
        console.log(`  Children NodeIds: [${children.map(c => c.nodeId).join(', ')}]`);
    });

    // Second pass: handle remaining unprocessed todos
    todos.forEach(todo => {
        if (!processedNodes.has(todo.nodeId)) {
            console.log(`  ➕ Adding standalone todo with NodeId: ${todo.nodeId}`);
            groups.set(todo.nodeId, []);
            processedNodes.add(todo.nodeId);
        }
    });

    return groups;
}
