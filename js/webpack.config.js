const config = require('flarum-webpack-config');
const path = require('path');

const flarumConfig = config();

// Giriş noktaları (Entry Points)
flarumConfig.entry = {
    // Admin Paneli
    admin: path.resolve(__dirname, './src/admin/index.js'),
    
    // Forum (Site Arayüzü) - BURAYI EKLEDİK
    forum: path.resolve(__dirname, './src/forum/index.js')
};

module.exports = flarumConfig;