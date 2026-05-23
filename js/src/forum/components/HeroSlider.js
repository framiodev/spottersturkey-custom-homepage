import app from 'flarum/common/app';
import Component from 'flarum/common/Component';

export default class HeroSlider extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.currentIndex = 0;
        this.isPreview = vnode.attrs.preview; 
        
        this.buildPages(vnode.attrs);

        if (this.pages.length > 1) {
            this.startAutoPlay();
        }
    }

    buildPages(attrs) {
        let imageSlides = [];

        this.textSlide = null;
        if (!this.isPreview) {
            const welcomeTitle = app.forum.attribute('welcomeTitle');
            if (welcomeTitle) {
                this.textSlide = {
                    title: welcomeTitle,
                    message: app.forum.attribute('welcomeMessage') || ''
                };
            }

            try {
                const rawSlides = JSON.parse(app.forum.attribute('framioSliderData') || '[]');
                imageSlides = rawSlides.filter(s => s.url && s.url.trim() !== '');
            } catch (e) {}
        } else {
            imageSlides = (attrs.slides || []).filter(s => s.url && s.url.trim() !== '');
        }

        this.layoutMode = this.isPreview ? (attrs.layoutMode || 'grid-8') : (app.forum.attribute('framioSliderLayoutMode') || 'grid-8');
        
        let chunkSize = 16;
        if (this.layoutMode === 'grid-8') chunkSize = 8;
        if (this.layoutMode === 'grid-4') chunkSize = 4;

        this.pages = [];
        for (let i = 0; i < imageSlides.length; i += chunkSize) {
            this.pages.push(imageSlides.slice(i, i + chunkSize));
        }

        if (this.currentIndex >= this.pages.length) {
            this.currentIndex = 0;
        }
    }

    onbeforeupdate(vnode) {
        if (this.isPreview) {
            this.buildPages(vnode.attrs);
            if (this.pages.length <= 1) this.stopAutoPlay();
            else if (!this.autoPlayInterval) this.startAutoPlay();
        }
    }

    onremove() {
        this.stopAutoPlay();
    }

    startAutoPlay() {
        if (this.autoPlayInterval) clearInterval(this.autoPlayInterval);
        this.autoPlayInterval = setInterval(() => {
            this.nextSlide();
            m.redraw();
        }, 5000); 
    }

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    nextSlide() {
        if (this.pages.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.pages.length;
    }

    prevSlide() {
        if (this.pages.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.pages.length) % this.pages.length;
    }

    setSlide(index) {
        this.currentIndex = index;
        this.startAutoPlay(); 
    }

    view() {
        if (this.pages.length === 0 && !this.textSlide) {
            if (this.isPreview) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', aspectRatio: '3/2', background: '#222', color: '#666', border: '2px dashed #444' }}>Görsel ekleyiniz.</div>;
            return null;
        }

        let customStyles = {
            position: 'relative',
            width: '100%',
            maxWidth: '100%', 
            overflow: 'hidden',
            background: '#111',
            borderRadius: '0 !important', 
            height: 'auto' 
        };

        if (!this.isPreview) {
            customStyles.margin = '0 0 30px 0';
        } else {
            customStyles.margin = '0';
        }

        return (
            <div className="Framio-HeroSlider-Container" style={customStyles} onmouseenter={() => this.stopAutoPlay()} onmouseleave={() => this.startAutoPlay()}>
                
                <div className="Framio-HeroSlider-Viewport">
                    <div className="Framio-HeroSlider-Track" style={{
                        transform: `translateX(-${this.currentIndex * 100}%)`
                    }}>
                        {this.pages.map((page, pIdx) => {
                            let itemCount = 4;
                            if (page.length > 12) itemCount = 16;
                            else if (page.length > 8) itemCount = 12;
                            else if (page.length > 4) itemCount = 8;

                            return (
                                <div key={`page-${pIdx}`} className={`Framio-HeroSlider-Page items-${itemCount}`}>
                                    {page.map((img, iIdx) => {
                                        
                                        const isClickable = !!img.discussionId && !this.isPreview;
                                        
                                        // GÜNCELLEME: Eğer tıknalabilir ise, yeni sekmede ve spesifik mesaja (postNumber) gidecek <a> etiketi oluşturulur
                                        if (isClickable) {
                                            let routePath = app.route('discussion', { id: img.discussionId });
                                            
                                            // Mesaj numarası (Örn: 82) varsa, rotanın sonuna ekle
                                            if (img.postNumber) {
                                                routePath += '/' + img.postNumber;
                                            }

                                            // Flarum Base URL ile birleştir ki target="_blank" hatasız çalışsın
                                            let fullUrl = routePath;
                                            if (!fullUrl.startsWith('http')) {
                                                const baseUrl = app.forum.attribute('baseUrl');
                                                fullUrl = baseUrl.replace(/\/$/, '') + '/' + routePath.replace(/^\//, '');
                                            }
                                            
                                            return (
                                                <a 
                                                    key={`img-${pIdx}-${iIdx}`} 
                                                    href={fullUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="Framio-Grid-Item" 
                                                    style={{ 
                                                        backgroundImage: `url("${img.url}")`,
                                                        display: 'block' 
                                                    }}
                                                ></a>
                                            );
                                        }

                                        return (
                                            <div 
                                                key={`img-${pIdx}-${iIdx}`} 
                                                className="Framio-Grid-Item" 
                                                style={{ backgroundImage: `url("${img.url}")` }}
                                            ></div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {this.textSlide && !this.isPreview && (
                    <div className="Framio-Collage-Overlay">
                        <h2 className="Welcome-Title">{this.textSlide.title}</h2>
                        <div className="Welcome-Message">{m.trust(this.textSlide.message)}</div>
                    </div>
                )}

                {this.pages.length > 1 && (
                    <div className="Framio-HeroSlider-Dots">
                        {this.pages.map((_, idx) => (
                            <div 
                                key={'dot-' + idx}
                                className={`Framio-HeroSlider-Dot ${this.currentIndex === idx ? 'active' : ''}`}
                                onclick={(e) => { e.stopPropagation(); this.setSlide(idx); }}
                            ></div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}