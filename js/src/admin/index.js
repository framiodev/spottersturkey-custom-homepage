import app from 'flarum/admin/app';
import CustomHomepageSettingsPage from './components/CustomHomepageSettingsPage';

app.initializers.add('framio-custom-homepage', () => {
    app.extensionData
        .for('framio-custom-homepage')
        .registerPage(CustomHomepageSettingsPage)
        .registerPermission(
            {
                icon: 'fas fa-home',
                label: 'Özel Ana Sayfa Ayarlarını Yönet',
                permission: 'framio-custom-homepage.manage_settings',
            },
            'moderate'
        );
});