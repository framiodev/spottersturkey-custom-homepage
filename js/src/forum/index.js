import app from 'flarum/forum/app';
import { extend, override } from 'flarum/common/extend';
import TagsPage from 'flarum/tags/components/TagsPage';
import IndexPage from 'flarum/forum/components/IndexPage';
import DiscussionList from 'flarum/forum/components/DiscussionList';
import DiscussionListState from 'flarum/forum/states/DiscussionListState';
import LinkButton from 'flarum/common/components/LinkButton';
import CustomHomepage from './components/CustomHomepage';
import GalleryPage from './components/GalleryPage';
import HeroSlider from './components/HeroSlider';
import LatestActivity from './components/LatestActivity'; 
import TagCarousel from './components/TagCarousel'; 
import CategoryGallery from './components/CategoryGallery';

app.initializers.add('framio-custom-homepage', () => {
    app.routes['spotters.gallery'] = { path: '/gallery', component: GalleryPage };

    const originalTrans = app.translator.trans.bind(app.translator);
    app.translator.trans = function(id, parameters) {
        if (id === 'core.forum.index_sort.gallery_button') {
            return 'Fotoğraflar';
        }
        return originalTrans(id, parameters);
    };

    extend(IndexPage.prototype, 'navItems', function (items) {
        items.add(
            'spottersGallery',
            <LinkButton href={app.route('spotters.gallery')} icon="fas fa-camera-retro">
                Galeri
            </LinkButton>,
            15 
        );
    });

    const injectToView = function (vdom) {
        const path = m.route.get();
        const isCarouselMode = app.forum.attribute('framioTagLayoutMode') === 'carousel';
        
        if (path === '/' || path === '') {
            setTimeout(() => document.body.classList.add('Framio-HomePage-Active'), 0);

            if (isCarouselMode) {
                setTimeout(() => document.body.classList.add('Framio-CarouselMode-Active'), 0);
            } else {
                setTimeout(() => document.body.classList.remove('Framio-CarouselMode-Active'), 0);
            }

            if (vdom && vdom.children && Array.isArray(vdom.children)) {
                let insertIndex = 1; 

                if (app.forum.attribute('framioSliderActive') !== '0') {
                    // YENİ GÜVENLİ YÖNTEM: Slider aktifse body'ye class ekle (Orijinali CSS ile gizlemek için)
                    setTimeout(() => document.body.classList.add('Framio-Slider-Active'), 0);

                    const hasSlider = vdom.children.some(child => child && child.tag === HeroSlider);
                    if (!hasSlider) {
                        vdom.children.splice(insertIndex, 0, <HeroSlider />);
                    }
                    insertIndex++; 
                } else {
                    // Slider kapalıysa class'ı kaldır (Orijinal gri alan geri gelsin)
                    setTimeout(() => document.body.classList.remove('Framio-Slider-Active'), 0);
                }

                const hasLatestActivity = vdom.children.some(child => child && child.tag === LatestActivity);
                if (!hasLatestActivity) {
                    vdom.children.splice(insertIndex, 0, <LatestActivity />);
                }
                insertIndex++;

                if (app.forum.attribute('framioGalleryActive') !== '0') {
                    const hasCustomHomepage = vdom.children.some(child => child && child.tag === CustomHomepage);
                    if (!hasCustomHomepage) {
                        vdom.children.push(<CustomHomepage />);
                    }
                }
            }
        } else {
            setTimeout(() => {
                document.body.classList.remove('Framio-HomePage-Active');
                document.body.classList.remove('Framio-CarouselMode-Active');
                document.body.classList.remove('Framio-Slider-Active');
            }, 0);
        }
    };

    extend(IndexPage.prototype, 'view', injectToView);
    
    if (TagsPage) {
        extend(TagsPage.prototype, 'view', injectToView);
        
        override(TagsPage.prototype, 'content', function (original) {
            const path = m.route.get();
            const isCarouselMode = app.forum.attribute('framioTagLayoutMode') === 'carousel';

            if ((path === '/' || path === '') && isCarouselMode) {
                return [
                    <TagCarousel />,
                    original()
                ];
            }
            return original();
        });
    }

    override(DiscussionListState.prototype, 'sortMap', function (original) {
        const map = original();
        const currentRoute = app.current.get('routeName');
        
        if (currentRoute === 'tag' && app.forum.attribute('framioCategoryGalleryActive') !== '0') {
            const tagSlug = m.route.param('tags');
            const tag = app.store.all('tags').find(t => t.slug() === tagSlug);
            const isSecondary = tag && tag.parent() ? true : false;
            
            let overrides = {};
            try { overrides = JSON.parse(app.forum.attribute('framioTagGalleryOverrides') || '{}'); } catch(e) {}
            const tagOverride = overrides[tagSlug];
            const isCustom = tagOverride && tagOverride.override_active === '1';

            const isGalleryActive = isCustom 
                ? tagOverride.gallery_active !== '0' 
                : (isSecondary ? app.forum.attribute('framioSecondaryGalleryActive') !== '0' : app.forum.attribute('framioPrimaryGalleryActive') !== '0');
            
            const defaultSort = isCustom 
                ? tagOverride.default_sort || 'gallery' 
                : (isSecondary ? app.forum.attribute('framioSecondaryDefaultSort') || 'gallery' : app.forum.attribute('framioPrimaryDefaultSort') || 'gallery');

            if (isGalleryActive) {
                if (defaultSort === 'gallery') {
                    const newMap = { gallery: 'gallery' };
                    for (const key in map) newMap[key] = map[key];
                    return newMap;
                } else {
                    const newMap = {};
                    for (const key in map) newMap[key] = map[key];
                    newMap['gallery'] = 'gallery';
                    return newMap;
                }
            }
        }
        
        return map;
    });

    override(DiscussionListState.prototype, 'requestParams', function (original) {
        const params = original();
        if (params.sort === 'gallery') {
            delete params.sort;
        }
        return params;
    });

    override(DiscussionList.prototype, 'view', function (original) {
        const currentRoute = app.current.get('routeName');
        const state = this.attrs.state;

        if (currentRoute === 'tag' && app.forum.attribute('framioCategoryGalleryActive') !== '0') {
            
            const tagSlug = m.route.param('tags');
            const tag = app.store.all('tags').find(t => t.slug() === tagSlug);
            const isSecondary = tag && tag.parent() ? true : false;
            
            let overrides = {};
            try { overrides = JSON.parse(app.forum.attribute('framioTagGalleryOverrides') || '{}'); } catch(e) {}
            const tagOverride = overrides[tagSlug];
            const isCustom = tagOverride && tagOverride.override_active === '1';

            const isGalleryActive = isCustom 
                ? tagOverride.gallery_active !== '0' 
                : (isSecondary ? app.forum.attribute('framioSecondaryGalleryActive') !== '0' : app.forum.attribute('framioPrimaryGalleryActive') !== '0');
                
            const showInOtherTabs = isCustom 
                ? tagOverride.other_tabs_active !== '0' 
                : (isSecondary ? app.forum.attribute('framioSecondaryOtherTabsActive') !== '0' : app.forum.attribute('framioPrimaryOtherTabsActive') !== '0');
                
            const galleryPosition = isCustom 
                ? tagOverride.position || 'top' 
                : (isSecondary ? app.forum.attribute('framioSecondaryGalleryPosition') || 'top' : app.forum.attribute('framioPrimaryGalleryPosition') || 'top');

            if (!isGalleryActive) return original();

            const currentSort = m.route.param('sort') || Object.keys(state.sortMap())[0];

            if (currentSort === 'gallery') {
                return (
                    <div className={'DiscussionList' + (state.isSearchResults() ? ' DiscussionList--searchResults' : '')}>
                        <div className="DiscussionList-GalleryView">
                            <CategoryGallery tagSlug={tagSlug} isMainGallery={true} sort={currentSort} />
                        </div>
                    </div>
                );
            } else {
                const originalView = original();
                
                if (!showInOtherTabs) return originalView;

                return (
                    <div className="Framio-DiscussionList-WithGallery">
                        {galleryPosition === 'top' ? (
                            <div className="DiscussionList-GalleryView" style={{ marginBottom: '30px' }}>
                                <CategoryGallery tagSlug={tagSlug} isMainGallery={false} sort={currentSort} />
                            </div>
                        ) : null}
                        
                        {originalView}
                        
                        {galleryPosition === 'bottom' ? (
                            <div className="DiscussionList-GalleryView" style={{ marginTop: '30px' }}>
                                <CategoryGallery tagSlug={tagSlug} isMainGallery={false} sort={currentSort} />
                            </div>
                        ) : null}
                    </div>
                );
            }
        }

        return original();
    });
});