const fs = require('fs');
const path = require('path');

// Create public directory
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

// Copy HTML files
const files = ['index.html', 'chat.html', '404.html'];
files.forEach(file => {
    if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join('public', file));
        console.log(`Copied ${file} to public/`);
    }
});

// Copy assets
if (fs.existsSync('a.png')) {
    fs.copyFileSync('a.png', 'public/a.png');
    console.log('Copied a.png to public/');
}

console.log('Build completed successfully');