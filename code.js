figma.showUI(__html__, { width: 300, height: 400 });
figma.ui.onmessage = function (msg) {
    if (msg.type === 'add-todo') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.ui.postMessage({ 
                type: 'no-selection',
                message: 'Please select an object first'
            });
            return;
        }

        // Store the node ID and todo text
        const nodeId = selection[0].id;
        const todoText = msg.text;
        
        // Store this in plugin data
        try {
            const todos = figma.root.getPluginData('todos') 
                ? JSON.parse(figma.root.getPluginData('todos')) 
                : [];
            
            todos.push({
                id: Date.now(),
                nodeId: nodeId,
                text: todoText,
                completed: false
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

    // Don't close the plugin automatically
    if (msg.type === 'close-plugin') {
        figma.closePlugin();
    }
};
