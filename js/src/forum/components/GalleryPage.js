import IndexPage from 'flarum/forum/components/IndexPage';
import CustomHomepage from './CustomHomepage';
import icon from 'flarum/common/helpers/icon';

export default class GalleryPage extends IndexPage {
    oninit(vnode) {
        super.oninit(vnode);
        this.homepage = new CustomHomepage();
        this.homepage.oninit(vnode);
    }

    oncreate(vnode) {
        super.oncreate(vnode);
        this.homepage.oncreate(vnode);
    }

    onremove(vnode) {
        super.onremove(vnode);
        this.homepage.onremove(vnode);
    }

    hero() {
        // [DEBUG] GALERİ SAYFASI KONTROLÜ
        console.log("[DEBUG - GalleryPage] hero() fonksiyonu çalıştı. Buraya slider EKLENMİYOR.");
        return null; // Kesinlikle null dönmeli!
    }

    content() {
        const posts = this.homepage.galleryPosts;
        const loading = this.homepage.loadingGallery;

        return (
            <div className="IndexPage-results container">
                <div className="Jetphotos-Layout">
                    <div className="Jetphotos-Header">
                        <h2>LATEST UPLOADS</h2>
                        <span>Spotters Turkey</span>
                    </div>
                    {loading ? (
                        <p>Galeri yükleniyor...</p>
                    ) : posts.length > 0 ? (
                        <>
                            {this.renderHeroCard(posts[0], 0)}
                            <div className="Jetphotos-SubGrid">
                                {posts.slice(1).map((post, idx) => this.renderSubCard(post, idx + 1))}
                            </div>
                        </>
                    ) : (
                        <p>Gösterilecek fotoğraf bulunamadı.</p>
                    )}
                </div>
                {this.homepage.lightboxOpen && this.homepage.renderLightbox()}
            </div>
        );
    }

    renderHeroCard(post, index) {
        const firstImage = post.images[0];
        const attr = firstImage.attributes || firstImage;
        const defaultTitle = attr.title || attr.filename || 'Spotters Fotoğraf';
        const title = this.homepage.getAestheticTitle(post, defaultTitle);
        
        const exif = this.homepage.getExifDisplay(attr.exif || null);
        const camera = exif.camera !== 'Bilinmiyor' ? exif.camera : 'Spotters Turkey';
        const brandMatch = title.match(/(Mercedes-Benz|MAN|Scania|Volvo|Ford|Neoplan|Setra|TEMSA|DAF)/i);
        const badge = brandMatch ? brandMatch[0] : camera;

        return (
            <div className="Jetphotos-Hero" onclick={(e) => this.homepage.handlePostClick(e, index)}>
                <img src={this.homepage.getDisplayUrl(firstImage)} alt={title} loading="lazy" />
                <div className="Jetphotos-BottomBar">
                    <div className="Photographer">{title}</div>
                    <div className="Aircraft">{badge}</div>
                </div>
            </div>
        );
    }

    renderSubCard(post, index) {
        const firstImage = post.images[0];
        const attr = firstImage.attributes || firstImage;
        const defaultTitle = attr.title || attr.filename || 'Spotters Fotoğraf';
        const title = this.homepage.getAestheticTitle(post, defaultTitle);
        
        const exif = this.homepage.getExifDisplay(attr.exif || null);
        const camera = exif.camera !== 'Bilinmiyor' ? exif.camera : 'Spotters Turkey';
        const brandMatch = title.match(/(Mercedes-Benz|MAN|Scania|Volvo|Ford|Neoplan|Setra|TEMSA|DAF)/i);
        const badge = brandMatch ? brandMatch[0] : camera;

        return (
            <div className="Jetphotos-SubCard" onclick={(e) => this.homepage.handlePostClick(e, index)}>
                <img src={this.homepage.getDisplayUrl(firstImage)} alt={title} loading="lazy" />
                {post.images.length > 1 && <div className="MultiImageIcon">{icon('fas fa-clone')}</div>}
                <div className="Jetphotos-BottomBar">
                    <div className="Photographer">{title}</div>
                    <div className="Aircraft">{badge}</div>
                </div>
            </div>
        );
    }
}