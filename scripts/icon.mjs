import sharp from 'sharp';
await sharp('assets/folio-icon-source.png').resize(1024, 1024).png().toFile('public/icon.png');
