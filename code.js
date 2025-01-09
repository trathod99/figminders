const CREATE_TODO_MODAL = `
<div class="modal">
  <input 
    type="text" 
    id="todoInput" 
    placeholder="Enter todo text..." 
    value="Todo: ">
  <div class="button-row">
    <button id="createButton">Create</button>
    <button id="cancelButton">Cancel</button>
  </div>
</div>

<style>
  body {
    font-family: Inter, sans-serif;
    margin: 0;
    padding: 16px;
  }
  
  .modal {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }
  
  input:focus {
    outline: none;
    border-color: #18A0FB;
    box-shadow: 0 0 0 2px rgba(24, 160, 251, 0.1);
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  
  button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  }
  
  #createButton {
    background: #18A0FB;
    color: white;
  }
  
  #cancelButton {
    background: #f5f5f5;
    color: #333;
  }
</style>

<script>
document.getElementById('todoInput').focus();
document.getElementById('todoInput').select();

document.getElementById('createButton').onclick = () => {
  const text = document.getElementById('todoInput').value;
  parent.postMessage({ pluginMessage: { type: 'create-with-text', text } }, '*');
};

document.getElementById('cancelButton').onclick = () => {
  parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
};

// Handle Enter key
document.getElementById('todoInput').onkeydown = (e) => {
  if (e.key === 'Enter') {
    document.getElementById('createButton').click();
  }
  if (e.key === 'Escape') {
    document.getElementById('cancelButton').click();
  }
};
</script>
`;

figma.showUI(__html__, { width: 600, height: 600 });

// At the top of the file, add command handling
if (figma.command === 'create-todo') {
    createTodoFromContext();
} else if (figma.command === 'view-todos') {
    showTodoList();
}

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

// Create a single message handler at the top level
figma.ui.onmessage = async function (msg) {
    // Handle create-todo-modal messages
    if (msg.type === 'create-with-text') {
        const selection = figma.currentPage.selection;
        const selectedNode = selection[0];
        const nodeId = selectedNode.id;
        const nodeName = selectedNode.name;
        
        // Create a preview image
        const imageData = await selectedNode.exportAsync({
            format: 'PNG',
            constraint: { type: 'WIDTH', value: 384 }
        });

        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            
            todos.unshift({
                id: Date.now(),
                nodeId: nodeId,
                nodeName: nodeName,
                text: msg.text,
                completed: false,
                preview: figma.base64Encode(imageData),
                priority: 'P2',
                priorityClass: 'p2'
            });
            
            figma.root.setPluginData('todos', JSON.stringify(todos));
            figma.notify(`Todo created for "${nodeName}"`);
            
            // Instead of closing and reopening, just show the main UI
            showTodoList();
            
            // Send the updated todos to the UI
            figma.ui.postMessage({
                type: 'todos-updated',
                todos: todos
            });
        } catch (error) {
            console.error('Error creating todo:', error);
            figma.notify('Error creating todo');
        }
        return;
    }

    if (msg.type === 'cancel') {
        figma.closePlugin();
        return;
    }

    // Handle all other existing message types
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
            
            const newTodo = {
                id: Date.now(),
                nodeId: nodeId,
                nodeName: nodeName,
                text: todoText,
                completed: false,
                preview: figma.base64Encode(imageData),
                priority: msg.priority,
                priorityClass: msg.priorityClass
            };
            
            console.log('Saving todo with priority data:', {
                text: todoText,
                priority: msg.priority,
                priorityClass: msg.priorityClass
            });
            
            todos.unshift(newTodo);
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
    
    // Only organize active (uncompleted) todos
    const activeTodos = todos.filter(todo => !todo.completed);
    
    const groups = new Map();
    const processedNodes = new Set();

    // Helper function to get all descendant nodeIds recursively
    function getAllDescendants(nodeId, depth = 0) {
        const node = figma.getNodeById(nodeId);
        if (!node) return [];
        
        let descendants = [];
        
        // Helper function to recursively search for todos in the node tree
        function searchNodeForTodos(currentNode, currentDepth) {
            if (!('children' in currentNode)) return;
            
            for (const child of currentNode.children) {
                // Check if this node has a corresponding todo
                const childTodo = activeTodos.find(t => t.nodeId === child.id);
                if (childTodo) {
                    descendants.push({
                        todo: childTodo,
                        depth: currentDepth + 1
                    });
                }
                
                // Continue searching this branch regardless of whether we found a todo
                searchNodeForTodos(child, currentDepth + 1);
            }
        }
        
        // Start the recursive search from our node
        searchNodeForTodos(node, depth);
        
        return descendants;
    }

    // Process each active todo to find its complete hierarchy
    activeTodos.forEach(todo => {
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

// Add this new function
async function createTodoFromContext() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        figma.notify('Please select an object first');
        return;
    }

    // Show a small modal for text input
    figma.showUI(CREATE_TODO_MODAL, { 
        width: 300, 
        height: 120,
        title: 'Create Todo'
    });
}

// Add this new function to show the todo list
function showTodoList() {
    figma.showUI(__html__, { width: 600, height: 600 });
}
