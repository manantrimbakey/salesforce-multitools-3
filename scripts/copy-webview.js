const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'client', 'dist');
const dest = path.join(__dirname, '..', 'dist', 'webview');

// Create destination directory if it doesn't exist
if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
}

// Recursive function to copy files
const copyFiles = (dir, destDir) => {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Get all files in the directory
    const files = fs.readdirSync(dir);
    
    // Copy each file or directory
    for (const file of files) {
        const srcPath = path.join(dir, file);
        const destPath = path.join(destDir, file);
        
        // Check if it's a directory or a file
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            // Recursively copy directory
            copyFiles(srcPath, destPath);
        } else {
            // Copy file
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

// Start copying from source to destination
try {
    if (fs.existsSync(src)) {
        copyFiles(src, dest);
        console.log('Copied webview files from', src, 'to', dest);
    } else {
        console.warn('Source directory does not exist:', src);
        
        // Fallback to copying from public (for development)
        const publicSrc = path.join(__dirname, '..', 'client', 'public');
        if (fs.existsSync(publicSrc)) {
            copyFiles(publicSrc, dest);
            console.log('Copied webview files from', publicSrc, 'to', dest);
        } else {
            console.error('Neither dist nor public directories exist in client folder');
        }
    }
} catch (error) {
    console.error('Error copying webview files:', error);
} 