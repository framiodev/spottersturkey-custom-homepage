import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import icon from 'flarum/common/helpers/icon';

export default class TagCarousel extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.tags = [];
        this.loadTags();
    }

    loadTags() {
        const allTags = app.store.all('tags');
        this.tags = allTags.filter(tag => !tag.parent() && tag.position() !== null)
                           .sort((a, b) => a.position() - b.position());
    }

    scroll(direction) {
        const container = document.getElementById('Framio-TagSlider');
        if (container) {
            const scrollAmount = container.clientWidth / 2; 
            container.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
        }
    }

    view() {
        if (!this.tags || this.tags.length === 0) return null;

        const cardStyleSetting = app.forum.attribute('framioTagCardStyle') || 'image';
        const cardWidth = app.forum.attribute('framioTagCarouselWidth') || 'calc((100% - 40px) / 3)';
        const cardHeight = app.forum.attribute('framioTagCarouselHeight') || '250px';
        
        const tagCovers = JSON.parse(app.forum.attribute('framioTagCovers') || '{}');

        return (
            <div className="Framio-Carousel-Wrapper">
                <div className="Framio-Carousel-Inner">
                    
                    <button className="Framio-Carousel-Btn prev" onclick={() => this.scroll(-1)}>
                        {icon('fas fa-chevron-left')}
                    </button>

                    <div id="Framio-TagSlider" className="Framio-Carousel-Track">
                        {this.tags.map(tag => {
                            const customCover = tagCovers[tag.id()];
                            const finalBgUrl = customCover || tag.backgroundUrl();
                            const hasBgImage = !!finalBgUrl;
                            const bgColor = tag.color() || '#333';
                            
                            let style = {
                                width: cardWidth,
                                height: cardHeight,
                                flex: `0 0 ${cardWidth}`
                            };

                            if (cardStyleSetting !== 'image') {
                                style.backgroundColor = bgColor;
                            }

                            const cardClass = `Framio-Carousel-Card Style-${cardStyleSetting}`;

                            return (
                                <Link href={app.route('tag', { tags: tag.slug() })} className={cardClass} style={style}>
                                    
                                    {/* Sadece Arka Plan Resmi (Varsayılan Siyah-Beyaz) */}
                                    {cardStyleSetting === 'image' && (
                                        <div className="Framio-Carousel-Bg" style={{ 
                                            backgroundImage: hasBgImage ? `url("${finalBgUrl}")` : 'none', 
                                            backgroundColor: bgColor 
                                        }}></div>
                                    )}

                                    {/* Siyah Degrade (Yazı okunsun diye) */}
                                    {cardStyleSetting === 'image' && (
                                        <div className="Framio-Carousel-Overlay"></div>
                                    )}

                                    <div className="Framio-Carousel-Card-Content">
                                        <div className="Framio-Carousel-Text-Wrapper">
                                            <h3 className="Framio-Carousel-Card-Title">
                                                {tag.name()}
                                            </h3>
                                            {tag.description() && (
                                                <p className="Framio-Carousel-Desc" title={tag.description()}>{tag.description()}</p>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    <button className="Framio-Carousel-Btn next" onclick={() => this.scroll(1)}>
                        {icon('fas fa-chevron-right')}
                    </button>
                </div>
            </div>
        );
    }
}