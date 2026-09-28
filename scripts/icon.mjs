import sharp from 'sharp';
await sharp('assets/leaf-icon-cat-book.png').resize(1024, 1024).png().toFile('public/icon.png');
