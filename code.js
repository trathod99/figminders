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

    // Helper function to get all descendant nodeIds recursively
    function getAllDescendants(nodeId, depth = 0) {
        const node = figma.getNodeById(nodeId);
        if (!node) return [];
        
        let descendants = [];
        
        // If node has children property
        if ('children' in node) {
            // For each child
            node.children.forEach(child => {
                // Find if this child has a corresponding todo
                const childTodo = todos.find(t => t.nodeId === child.id);
                if (childTodo) {
                    descendants.push({
                        todo: childTodo,
                        depth: depth + 1
                    });
                }
                
                // Recursively get descendants of this child
                const childDescendants = getAllDescendants(child.id, depth + 1);
                descendants = [...descendants, ...childDescendants];
            });
        }
        
        return descendants;
    }

    // Process each todo to find its complete hierarchy
    todos.forEach(todo => {
        if (processedNodes.has(todo.nodeId)) return;

        // Get the node for this todo
        const node = figma.getNodeById(todo.nodeId);
        if (!node) return;

        console.log(`\n📍 Processing todo: "${todo.text}" (Node: ${todo.nodeName})`);

        // Get all descendants with their depth information
        const descendants = getAllDescendants(todo.nodeId);
        
        if (descendants.length > 0) {
            console.log(`📎 Creating hierarchical group for "${todo.text}"`);
            console.log(`  Parent NodeId: ${todo.nodeId}`);
            console.log('  Descendants:');
            descendants.forEach(({ todo: childTodo, depth }) => {
                console.log(`  ${'  '.repeat(depth)}- "${childTodo.text}" (${childTodo.nodeName})`);
            });
            
            // Store just the todo objects in the groups map
            groups.set(todo.nodeId, descendants.map(d => d.todo));
            processedNodes.add(todo.nodeId);
            descendants.forEach(({ todo: childTodo }) => {
                processedNodes.add(childTodo.nodeId);
            });
        } else {
            // Add as standalone todo
            groups.set(todo.nodeId, []);
            processedNodes.add(todo.nodeId);
        }
    });

    return groups;
}
