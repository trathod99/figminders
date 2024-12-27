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
        const todoText = msg.text;
        
        try {
            const todos = JSON.parse(figma.root.getPluginData('todos') || '[]');
            
            todos.unshift({
                id: Date.now(),
                nodeId: nodeId,
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
};
