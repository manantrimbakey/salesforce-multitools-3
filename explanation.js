// JavaScript functionality for the Salesforce Multitools extension explanation page

document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers for expandable sections
    setupExpandableSections();
    
    // Add highlighting for code sections
    highlightCode();
    
    // Draw simple architecture diagram
    drawArchitectureDiagram();
});

/**
 * Setup interactive expandable sections
 */
function setupExpandableSections() {
    const features = document.querySelectorAll('.feature');
    
    features.forEach(feature => {
        const heading = feature.querySelector('h3');
        const content = feature.querySelector('p, pre');
        
        if (heading && content) {
            heading.style.cursor = 'pointer';
            heading.innerHTML += ' <span class="toggle">+</span>';
            
            heading.addEventListener('click', () => {
                const isExpanded = content.style.display !== 'none';
                
                content.style.display = isExpanded ? 'none' : 'block';
                heading.querySelector('.toggle').textContent = isExpanded ? '+' : '-';
            });
        }
    });
}

/**
 * Add syntax highlighting to code blocks (simplified version)
 */
function highlightCode() {
    const codeBlocks = document.querySelectorAll('pre code');
    
    codeBlocks.forEach(block => {
        // Simple syntax highlighting - just for demonstration
        const html = block.innerHTML
            .replace(/\/\/(.*)/g, '<span style="color: green;">$&</span>') // Comments
            .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span style="color: #a31515;">$&</span>') // Strings
            .replace(/\b(function|const|let|var|if|else|switch|case|break|return|this)\b/g, 
                     '<span style="color: #0000ff;">$&</span>'); // Keywords
        
        block.innerHTML = html;
    });
}

/**
 * Draw a simple architecture diagram using canvas
 */
function drawArchitectureDiagram() {
    // Find all diagram containers
    const diagrams = document.querySelectorAll('.diagram');
    
    diagrams.forEach(diagram => {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        canvas.width = diagram.clientWidth;
        canvas.height = diagram.clientHeight;
        diagram.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Draw extension architecture
        drawExtensionArchitecture(ctx, canvas.width, canvas.height);
    });
}

/**
 * Draw the extension architecture diagram
 */
function drawExtensionArchitecture(ctx, width, height) {
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Configuration
    const boxWidth = width * 0.8;
    const boxHeight = 60;
    const startY = 50;
    const spacing = 30;
    
    // Draw VS Code container
    drawBox(ctx, width/2 - boxWidth/2, startY, boxWidth, boxHeight * 3 + spacing * 2, 
           'VS Code Extension Host', '#f0f0f0', '#333');
    
    // Draw Extension core
    drawBox(ctx, width/2 - boxWidth*0.7/2, startY + boxHeight + spacing, boxWidth * 0.7, boxHeight, 
           'Extension Core (TypeScript)', '#bbdefb', '#1976d2');
    
    // Draw Salesforce API
    drawBox(ctx, width/2 - boxWidth*0.4/2, startY + boxHeight*2 + spacing*2, boxWidth * 0.4, boxHeight, 
           'Salesforce API', '#d1c4e9', '#673ab7');
    
    // Draw arrows
    drawArrow(ctx, width/2, startY + boxHeight*2 + spacing, width/2, startY + boxHeight*2 + spacing*2);
    
    // Legend
    const legendX = width * 0.1;
    const legendY = height - 80;
    
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.fillText('Extension Architecture', legendX, legendY);
    
    drawBox(ctx, legendX, legendY + 10, 20, 15, '', '#bbdefb', '#1976d2');
    ctx.fillStyle = '#333';
    ctx.fillText('Extension Components', legendX + 30, legendY + 22);
    
    drawBox(ctx, legendX, legendY + 35, 20, 15, '', '#d1c4e9', '#673ab7');
    ctx.fillStyle = '#333';
    ctx.fillText('Salesforce API', legendX + 30, legendY + 47);
}

/**
 * Helper to draw a box with text
 */
function drawBox(ctx, x, y, width, height, text, fillColor, strokeColor) {
    // Draw the box
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    
    // Box with rounded corners
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [5]);
    ctx.fill();
    ctx.stroke();
    
    // Draw the text
    if (text) {
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + width/2, y + height/2);
    }
}

/**
 * Helper to draw an arrow
 */
function drawArrow(ctx, fromX, fromY, toX, toY) {
    const headLength = 10;
    const headAngle = Math.PI / 6;
    
    // Calculate angle
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLength * Math.cos(angle - headAngle),
        toY - headLength * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
        toX - headLength * Math.cos(angle + headAngle),
        toY - headLength * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fillStyle = '#555';
    ctx.fill();
} 