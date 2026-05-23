import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import icon from 'flarum/common/helpers/icon';

export default class CategoryGallery extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.currentTag = vnode.attrs.tagSlug;
        
        this.isMainGallery = vnode.attrs.isMainGallery !== false;
        this.currentSort = vnode.attrs.sort || 'gallery';
        
        this.galleryPosts = [];
        this.loadingGallery = true;
        
        this.updateVisibleLimit();

        try {
            this.coverOverrides = JSON.parse(app.forum.attribute('framioCustomHomepageCoverOverrides') || '{}');
        } catch(e) {
            this.coverOverrides = {};
        }
        
        this.lightboxOpen = false;
        this.infoPanelOpen = false;
        this.shareOpen = false;
        this.activePostIndex = 0;
        this.activeImageIndex = 0;
        
        this.initGalleryLoad();
    }

    updateVisibleLimit() {
        this.layoutSetting = app.forum.attribute('framioCategoryGalleryLayout') || '3';
        
        if (this.isMainGallery) {
            this.initialLimit = this.layoutSetting === '2' ? 8 : 12; 
        } else {
            this.initialLimit = this.layoutSetting === '2' ? 4 : 6; 
        }
        
        this.visibleLimit = this.initialLimit;
    }

    onupdate(vnode) {
        super.onupdate(vnode);
        let needsReload = false;
        
        if (vnode.attrs.tagSlug !== this.currentTag) {
            this.currentTag = vnode.attrs.tagSlug;
            needsReload = true;
        }
        
        if (vnode.attrs.sort !== this.currentSort) {
            this.currentSort = vnode.attrs.sort;
            needsReload = true;
        }

        if (vnode.attrs.isMainGallery !== this.isMainGallery) {
            this.isMainGallery = vnode.attrs.isMainGallery !== false;
            this.updateVisibleLimit();
            m.redraw();
        }

        if (needsReload) {
            this.loadingGallery = true;
            this.initGalleryLoad();
        }
    }

    oncreate(vnode) {
        super.oncreate(vnode);
        this.boundHandleKeydown = this.handleKeydown.bind(this);
        document.addEventListener('keydown', this.boundHandleKeydown);
    }

    onremove(vnode) {
        super.onremove(vnode);
        document.removeEventListener('keydown', this.boundHandleKeydown);
        $('body').removeClass('SpottersGallery-NoScroll');
    }

    handleKeydown(e) {
        if (!this.lightboxOpen) return;
        if (e.key === 'Escape') this.closeLightbox();
        if (e.key === 'ArrowLeft') this.prevPost(e);
        if (e.key === 'ArrowRight') this.nextPost(e);
        if (e.key === 'i' || e.key === 'I') this.toggleInfoPanel(e);
    }

    decodeHtml(text) {
        if (!text) return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = text;
        return txt.value;
    }

    initGalleryLoad() {
        const cachedData = localStorage.getItem(`framioCategoryGallery_v5_${this.currentTag}_${this.currentSort}`);
        
        if (cachedData) {
            try {
                this.galleryPosts = JSON.parse(cachedData);
                this.loadingGallery = false;
                m.redraw();
            } catch(e) {}
        }

        this.loadGalleryImagesParallel(!!cachedData);
    }

    loadGalleryImagesParallel(isSilent) {
        Promise.all([
            app.request({
                method: 'GET',
                url: app.forum.attribute('apiUrl') + '/framio/category-posts',
                params: { 
                    tag: this.currentTag,
                    include: 'discussion',
                    sort: this.currentSort
                }
            }).catch(() => ({ data: [], meta: {} })),
            app.request({
                method: 'GET',
                url: app.forum.attribute('apiUrl') + '/spotter-images',
                params: { page: { limit: 150 } }
            }).catch(() => ({ data: [] }))
        ]).then(([postsResponse, imagesResponse]) => {
            const rawPosts = postsResponse.data || [];
            const rawImages = imagesResponse.data || [];
            
            const metaExif = (postsResponse.meta && postsResponse.meta.spotterExifMap) ? postsResponse.meta.spotterExifMap : {};

            const imageMap = new Map();
            for (const img of rawImages) {
                imageMap.set(String(img.id), img);
            }

            const groupedPosts = [];
            const processedImageIds = new Set();

            const extractBaseName = (url) => {
                if (!url) return '';
                let filename = url.split('/').pop().split('?')[0];
                try { filename = decodeURIComponent(filename); } catch(e){}
                return filename.replace(/^thumb_/i, '').trim(); 
            };

            const cleanUrlFn = (rawUrl) => {
                let cleanUrl = this.decodeHtml(rawUrl); 
                try { 
                    cleanUrl = decodeURI(cleanUrl); 
                    cleanUrl = encodeURI(cleanUrl).replace(/\(/g, '%28').replace(/\)/g, '%29'); 
                } catch(e){}
                return cleanUrl;
            };

            for (const post of rawPosts) {
                // YALNIZCA HTML İŞLENİYOR (Hem yazarda hem ziyaretçide kusursuz çalışır)
                const contentHtml = post.attributes?.contentHtml || '';
                const postNumber = post.attributes?.number;
                
                const postImages = [];
                const addedBaseNames = new Set(); 

                const addImage = (id, rawUrl) => {
                    if (rawUrl && rawUrl.includes('firebasestorage') && !rawUrl.includes('thumb')) return;

                    const cleanUrl = rawUrl ? cleanUrlFn(rawUrl) : null;
                    let imgObj = null;
                    
                    if (id && imageMap.has(String(id))) {
                        imgObj = imageMap.get(String(id));
                        processedImageIds.add(String(id));
                    } else if (cleanUrl) {
                        let mappedImg = null;
                        imageMap.forEach((img, imgId) => {
                            let mapUrl = cleanUrlFn((img.attributes ? img.attributes.url : img.url) || '');
                            if (mapUrl === cleanUrl && !processedImageIds.has(imgId)) mappedImg = img;
                        });

                        if (mappedImg) {
                            imgObj = mappedImg;
                            processedImageIds.add(String(mappedImg.id));
                        }
                    }

                    // EXIF KUSURSUZ EŞLEŞTİRİCİSİ
                    let filename = cleanUrl ? cleanUrl.split('/').pop().split('?')[0] : '';
                    try { filename = decodeURIComponent(filename); } catch(e){}
                    let cleanFileName = filename.replace(/^thumb_/i, '').trim();
                    
                    let matchedExif = null;
                    if (id && metaExif['id_' + id]) {
                        matchedExif = metaExif['id_' + id];
                    } else if (metaExif['file_' + filename]) {
                        matchedExif = metaExif['file_' + filename];
                    } else if (metaExif['file_' + cleanFileName]) {
                        matchedExif = metaExif['file_' + cleanFileName];
                    } else if (metaExif['file_thumb_' + cleanFileName]) {
                        matchedExif = metaExif['file_thumb_' + cleanFileName];
                    } else if (cleanUrl) {
                        let decodedTargetUrl = cleanUrl;
                        try { decodedTargetUrl = decodeURIComponent(cleanUrl); } catch(e){}
                        
                        for (let dbKey in metaExif) {
                            if (dbKey.startsWith('path_')) {
                                let cleanDbKey = dbKey.replace('path_', '');
                                try { cleanDbKey = decodeURIComponent(cleanDbKey); } catch(e){}
                                
                                if (decodedTargetUrl.includes(cleanDbKey) || decodedTargetUrl.endsWith(cleanDbKey)) {
                                    matchedExif = metaExif[dbKey];
                                    break;
                                }
                            }
                        }
                    }

                    if (!imgObj) {
                        imgObj = {
                            id: id || `virtual_${post.id}_${postImages.length}`,
                            attributes: {
                                url: cleanUrl,
                                original_url: cleanUrl ? cleanUrl.replace('thumb_', '') : '',
                                filename: this.decodeHtml(filename),
                                exif: matchedExif 
                            }
                        };
                    } else if (matchedExif) {
                        if (imgObj.attributes) imgObj.attributes.exif = matchedExif;
                        else imgObj.exif = matchedExif;
                    }

                    if (imgObj) {
                        const finalUrl = cleanUrl || cleanUrlFn((imgObj.attributes ? imgObj.attributes.url : imgObj.url) || '');
                        const baseName = extractBaseName(finalUrl);
                        if (baseName && !addedBaseNames.has(baseName)) {
                            postImages.push(imgObj);
                            addedBaseNames.add(baseName);
                        }
                    }
                };

                const imgRegex = /<img[^>]+src=["']?([^"'>]+)["']?/gi;
                let match;
                while ((match = imgRegex.exec(contentHtml)) !== null) {
                    addImage(null, match[1]);
                }

                if (postImages.length > 0) {
                    let existingGroup = groupedPosts.find(g => g.real_post_id === post.id);

                    if (existingGroup) {
                        postImages.forEach(newImg => {
                            const newUrl = (newImg.attributes ? newImg.attributes.url : newImg.url) || '';
                            const newBase = extractBaseName(newUrl);
                            
                            const isDuplicate = existingGroup.images.some(exImg => {
                                const exUrl = (exImg.attributes ? exImg.attributes.url : exImg.url) || '';
                                return extractBaseName(exUrl) === newBase;
                            });
                            
                            if (!isDuplicate) {
                                existingGroup.images.push(newImg);
                            }
                        });
                    } else {
                        groupedPosts.push({
                            group_id: `post_${post.id}`,
                            real_post_id: post.id,
                            discussion_id: post.relationships?.discussion?.data?.id,
                            post_number: postNumber,
                            images: postImages,
                            postContentHtml: post.attributes?.contentHtml || '',
                            postContentLoaded: true,
                            postContentLoading: false
                        });
                    }
                }
            }

            let allGroups = groupedPosts;

            for (let group of allGroups) {
                if (group.images.length > 1 && group.real_post_id) {
                    let coverIdx = -1;
                    
                    if (!Array.isArray(this.coverOverrides) && this.coverOverrides[group.real_post_id]) {
                        const savedCoverUrl = this.coverOverrides[group.real_post_id];
                        coverIdx = group.images.findIndex(img => cleanUrlFn((img.attributes ? img.attributes.url : img.url) || '') === savedCoverUrl);
                    }
                    
                    if (coverIdx === -1 && Array.isArray(this.coverOverrides)) {
                        coverIdx = group.images.findIndex(img => this.coverOverrides.includes(String(img.id)) || this.coverOverrides.includes(parseInt(img.id)));
                    }

                    if (coverIdx > 0) {
                        let coverImg = group.images.splice(coverIdx, 1)[0];
                        group.images.unshift(coverImg);
                    }
                }
            }

            this.galleryPosts = allGroups;
            
            try {
                localStorage.setItem(`framioCategoryGallery_v5_${this.currentTag}_${this.currentSort}`, JSON.stringify(this.galleryPosts));
            } catch(e) {}

            if (!isSilent) {
                this.loadingGallery = false;
            }
            m.redraw();
        }).catch((e) => {
            console.error(e);
            if (!isSilent) {
                this.loadingGallery = false;
            }
            m.redraw();
        });
    }

    fetchPostContent(post) {
        if (post && post.real_post_id && !post.postContentLoaded && !post.postContentLoading) {
            post.postContentLoading = true;
            app.store.find('posts', post.real_post_id).then(postRecord => {
                post.postContentHtml = postRecord.contentHtml();
                post.postContentLoaded = true;
                post.postContentLoading = false;
                m.redraw();
            }).catch(() => {
                post.postContentLoaded = true;
                post.postContentLoading = false;
                m.redraw();
            });
        }
    }

    getAestheticTitle(post, fallbackTitle) {
        let cleanFallback = fallbackTitle;
        try {
            const txt = document.createElement('textarea');
            txt.innerHTML = fallbackTitle;
            cleanFallback = txt.value;
        } catch(e){}

        if (!post || !post.postContentHtml) return cleanFallback;
        
        const temp = document.createElement('div');
        temp.innerHTML = post.postContentHtml;
        const lis = temp.querySelectorAll('li');
        
        if (lis.length >= 2) {
            let company = lis[0].textContent.trim();
            if (company.includes('|')) company = company.split('|')[0].trim();
            else if (company.includes(' - ')) company = company.split(' - ')[0].trim();
            return `${company} & ${lis[1].textContent.trim()}`;
        } else if (lis.length === 1) {
            return lis[0].textContent.trim();
        }
        
        return cleanFallback;
    }

    loadMore() {
        this.visibleLimit += this.initialLimit;
        m.redraw();
    }

    showLess() {
        this.visibleLimit = this.initialLimit;
        m.redraw();
    }

    handlePostClick(e, postIndex) {
        e.preventDefault();
        const post = this.galleryPosts[postIndex];
        
        this.activePostIndex = postIndex;
        this.activeImageIndex = 0;
        this.lightboxOpen = true;
        this.infoPanelOpen = false;
        this.shareOpen = false;
        $('body').addClass('SpottersGallery-NoScroll');
        this.fetchPostContent(post);
        m.redraw();
    }

    closeLightbox() {
        this.lightboxOpen = false;
        this.shareOpen = false;
        $('body').removeClass('SpottersGallery-NoScroll');
        m.redraw();
    }

    nextPost(e) {
        if(e) e.stopPropagation();
        this.activePostIndex = (this.activePostIndex + 1) % this.galleryPosts.length;
        this.activeImageIndex = 0;
        this.shareOpen = false;
        this.fetchPostContent(this.galleryPosts[this.activePostIndex]);
        m.redraw();
    }

    prevPost(e) {
        if(e) e.stopPropagation();
        this.activePostIndex = (this.activePostIndex - 1 + this.galleryPosts.length) % this.galleryPosts.length;
        this.activeImageIndex = 0;
        this.shareOpen = false;
        this.fetchPostContent(this.galleryPosts[this.activePostIndex]);
        m.redraw();
    }

    nextImageInPost(e) {
        if(e) e.stopPropagation();
        const post = this.galleryPosts[this.activePostIndex];
        this.activeImageIndex = (this.activeImageIndex + 1) % post.images.length;
        m.redraw();
    }

    prevImageInPost(e) {
        if(e) e.stopPropagation();
        const post = this.galleryPosts[this.activePostIndex];
        this.activeImageIndex = (this.activeImageIndex - 1 + post.images.length) % post.images.length;
        m.redraw();
    }

    setImageIndex(idx, e) {
        if(e) e.stopPropagation();
        this.activeImageIndex = idx;
        m.redraw();
    }

    toggleInfoPanel(e) {
        if(e) e.stopPropagation();
        this.infoPanelOpen = !this.infoPanelOpen;
        m.redraw();
    }

    toggleShare(e) {
        if(e) e.stopPropagation();
        this.shareOpen = !this.shareOpen;
        m.redraw();
    }

    copyBBCode(image, e) {
        if(e) e.stopPropagation();
        const attr = image.attributes || image;
        const bbcode = String(image.id).includes('virtual') 
            ? `[img]${attr.original_url || attr.url}[/img]` 
            : `[spotter-image id=${image.id} url=${attr.url} alt=${attr.filename}]`;
            
        const textArea = document.createElement("textarea");
        textArea.value = bbcode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("Copy");
        textArea.remove();
        app.alerts.show({ type: 'success' }, 'BBCode kopyalandı!');
        this.shareOpen = false; 
    }

    shareSocial(platform, image) {
        const url = encodeURIComponent(window.location.href); 
        const text = encodeURIComponent("Spotters Turkey'daki bu harika fotoğrafa bak!");
        let shareUrl = '';
        switch(platform) {
            case 'twitter': shareUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`; break;
            case 'facebook': shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`; break;
            case 'whatsapp': shareUrl = `https://api.whatsapp.com/send?text=${text} ${url}`; break;
        }
        if (shareUrl) window.open(shareUrl, '_blank', 'width=600,height=400');
        this.shareOpen = false;
    }

    getDisplayUrl(item) {
        return (item.attributes ? item.attributes.url : item.url) || '';
    }

    getOriginalUrl(item) {
        return (item.attributes ? item.attributes.original_url || item.attributes.url : item.url) || '';
    }

    getExifDisplay(exifData) {
        let parsed = { camera: 'Bilinmiyor', lens: '-', exposure: '-', aperture: '-', iso: '-', focal: '-', date: 'Bilinmiyor' };
        if (exifData) {
            try {
                let data = typeof exifData === 'string' ? JSON.parse(exifData) : exifData;
                
                let make = data.make || data.Make || '';
                let model = data.model || data.Model || '';
                
                if (data.camera) {
                    parsed.camera = data.camera;
                } else if (make && model) {
                    if (model.toLowerCase().includes(make.toLowerCase())) {
                        parsed.camera = model;
                    } else {
                        parsed.camera = make + ' ' + model;
                    }
                } else {
                    parsed.camera = model || make || 'Bilinmiyor';
                }

                parsed.lens = data.lens || data.LensModel || data.Lens || '-';
                parsed.exposure = data.exposure || data.exposure_time || data.ExposureTime || '-';
                parsed.aperture = data.aperture || data.f_number || data.FNumber || '-';
                parsed.iso = data.iso || data.ISOSpeedRatings || data.ISO || '-';
                parsed.focal = data.focal || data.focal_length || data.FocalLength || '-';
                parsed.lat = data.lat || data.GPSLatitude;
                parsed.lon = data.lon || data.GPSLongitude;
                
                parsed.date = data.datetime_original || data.DateTimeOriginal || data.datetime || data.DateTime || data.date || 'Bilinmiyor';
            } catch(e) {}
        }
        return parsed;
    }

    renderCard(post, index) {
        const firstImage = post.images[0];
        const attr = firstImage.attributes || firstImage;
        const defaultTitle = attr.title || attr.filename || 'Spotters Turkey Fotoğrafı';
        const title = this.getAestheticTitle(post, defaultTitle);

        return (
            <div className="LayoutA-Card" onclick={(e) => this.handlePostClick(e, index)}>
                <img src={this.getDisplayUrl(firstImage)} alt={title} loading="lazy" />
                {post.images.length > 1 && (
                    <div className="MultiImageIcon">{icon('fas fa-clone')}</div>
                )}
                <div className="LayoutA-Overlay">
                    <div className="Title">{title}</div>
                </div>
            </div>
        );
    }

    renderLightbox() {
        const currentPost = this.galleryPosts[this.activePostIndex];
        if (!currentPost) return null;
        const currentImage = currentPost.images[this.activeImageIndex];
        const attr = currentImage.attributes || currentImage;
        const fileName = attr.filename || 'Fotoğraf';
        const displayTitle = this.getAestheticTitle(currentPost, attr.title || fileName);
        const description = attr.description || '';
        const discussionId = currentPost.discussion_id;
        const postNumber = currentPost.post_number;
        
        let discussionUrl = '';
        if (discussionId) {
            discussionUrl = app.route('discussion', { id: discussionId });
            if (postNumber) {
                discussionUrl += '/' + postNumber;
            }
        }
        
        let rawExif = attr.exif || attr.exifData || attr.exif_data || attr.exifdata || null;
        const exif = this.getExifDisplay(rawExif);
        
        let dateTaken = exif.date;
        if (dateTaken !== 'Bilinmiyor') {
            try {
                const parts = dateTaken.split(' ');
                const dParts = parts[0].split(':');
                dateTaken = `${dParts[2]}.${dParts[1]}.${dParts[0]}` + (parts[1] ? ' ' + parts[1].substring(0,5) : '');
            } catch(e) {}
        }

        let cleanHtml = currentPost.postContentHtml || '';
        if (cleanHtml) {
            cleanHtml = cleanHtml.replace(/<img[^>]*>/gi, '').replace(/<figure[^>]*>.*?<\/figure>/gi, '').replace(/<p>\s*<\/p>/gi, '');
            
            const triviaRegex = /(T[\s\u00A0]*R[\s\u00A0]*[Iİ][\s\u00A0]*V[\s\u00A0]*[Iİ][\s\u00A0]*A|Merakl[ıi]s[ıi]na[\s\u00A0]*[Iİiı]nfo)/i;
            const triviaMatch = cleanHtml.match(triviaRegex);

            if (triviaMatch && discussionUrl) {
                let cutIndex = triviaMatch.index;
                let matchedText = triviaMatch[0]; 
                
                let displayHeader = matchedText.toLowerCase().includes('merak') ? 'MERAKLISINA INFO' : 'T R I V I A';
                
                const lastBlockquote = cleanHtml.lastIndexOf('<blockquote', cutIndex);
                const lastP = cleanHtml.lastIndexOf('<p', cutIndex);
                const lastBr = cleanHtml.lastIndexOf('<br', cutIndex);
                const lastHr = cleanHtml.lastIndexOf('<hr', cutIndex);
                
                const closestTag = Math.max(lastBlockquote, lastP, lastBr, lastHr);
                
                if (closestTag !== -1 && (cutIndex - closestTag) < 150) {
                    cutIndex = closestTag; 
                }

                cleanHtml = cleanHtml.substring(0, cutIndex);
                
                cleanHtml += `
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(150,150,150,0.2); text-align: center;">
                        <span style="display: block; font-weight: bold; font-style: italic; font-size: 14px; color: inherit; letter-spacing: 2px; margin-bottom: 12px;">${displayHeader}</span>
                        <a href="${discussionUrl}" target="_blank" class="Button Button--primary" style="font-size: 12px; padding: 6px 12px; border-radius: 4px; text-decoration: none; display: inline-block;">
                            <i class="fas fa-external-link-square-alt" style="margin-right: 5px;"></i> Okumak İçin Konuya Git
                        </a>
                    </div>
                `;
            }
        }

        const panelOpenClass = this.infoPanelOpen ? 'PanelOpen' : '';

        return (
            <div className="SpottersGallery-Lightbox" onclick={() => this.closeLightbox()}>
                <button className="SpottersGallery-CloseBtn" onclick={() => this.closeLightbox()} title="Kapat">
                    {icon('fas fa-times')}
                </button>

                <div className="SpottersGallery-Lightbox-Wrapper" onclick={() => this.closeLightbox()}>
                    <button className="OuterNav Prev" onclick={(e) => { e.stopPropagation(); this.prevPost(e); }}>
                        {icon('fas fa-chevron-left')}
                    </button>

                    <div className={`SpottersGallery-Lightbox-Body ${panelOpenClass}`} onclick={(e) => e.stopPropagation()}>
                        <div className="SpottersGallery-Lightbox-ImageArea">
                            <div className="SpottersGallery-ImageContainer">
                                
                                <button className={`SpottersGallery-InfoToggle ${this.infoPanelOpen ? 'active' : ''}`} onclick={(e) => this.toggleInfoPanel(e)} title="Detaylar">
                                    {icon('fas fa-info')}
                                </button>

                                {currentPost.images.length > 1 && (
                                    <>
                                        <button className="SpottersGallery-InnerNav prev" onclick={(e) => this.prevImageInPost(e)}>{icon('fas fa-angle-left')}</button>
                                        <button className="SpottersGallery-InnerNav next" onclick={(e) => this.nextImageInPost(e)}>{icon('fas fa-angle-right')}</button>
                                    </>
                                )}

                                <div className="SpottersGallery-FloatingActions" onclick={(e) => e.stopPropagation()}>
                                    
                                    <div style={{position: 'relative'}}>
                                        <button className="SpottersGallery-FloatBtn" onclick={(e) => this.toggleShare(e)} data-tooltip="Paylaş">
                                            {icon('fas fa-share-alt')}
                                        </button>
                                        {this.shareOpen && (
                                            <div className="SpottersShare-Popup">
                                                <a className="SpottersShare-Item" onclick={() => this.shareSocial('twitter', currentImage)}>{icon('fab fa-twitter')} Twitter</a>
                                                <a className="SpottersShare-Item" onclick={() => this.shareSocial('facebook', currentImage)}>{icon('fab fa-facebook')} Facebook</a>
                                                <a className="SpottersShare-Item" onclick={() => this.shareSocial('whatsapp', currentImage)}>{icon('fab fa-whatsapp')} WhatsApp</a>
                                                <div className="SpottersShare-Item" onclick={(e) => this.copyBBCode(currentImage, e)}>{icon('fas fa-link')} BBCode Kopyala</div>
                                            </div>
                                        )}
                                    </div>

                                    {discussionId && (
                                        <a href={discussionUrl} target="_blank" className="SpottersGallery-FloatBtn primary" data-tooltip="Konuya Git">
                                            {icon('fas fa-external-link-square-alt')}
                                        </a>
                                    )}
                                    <a href={this.getOriginalUrl(currentImage)} target="_blank" className="SpottersGallery-FloatBtn" data-tooltip="Orijinal Boyut">
                                        {icon('fas fa-expand-arrows-alt')}
                                    </a>
                                </div>

                                <img src={this.getDisplayUrl(currentImage)} alt={displayTitle} />
                                
                                {!this.infoPanelOpen && (
                                    <div className="SpottersGallery-OverlayTitle">
                                        {displayTitle}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={`SpottersGallery-InfoPanel ${this.infoPanelOpen ? 'is-open' : ''}`}>
                            <div className="SpottersGallery-InfoContent">
                                
                                <div className="SpottersGallery-SideCard TitleCard">
                                    <h2>{displayTitle}</h2>
                                </div>

                                {(cleanHtml || description) && (
                                    <div className="SpottersGallery-SideCard DescCard">
                                        <div className="SpottersGallery-DescHeader">
                                            <h4>{cleanHtml ? 'MESAJ KÜNYESİ' : 'FOTOĞRAF AÇIKLAMASI'}</h4>
                                        </div>
                                        <div className="SpottersGallery-DescContent">
                                            {cleanHtml ? (
                                                m.trust(cleanHtml)
                                            ) : (
                                                <p>{description}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="SpottersGallery-SideCard ExifCard">
                                    <div className="ExifCard-Header">
                                        <h4>FOTOĞRAF BİLGİLERİ (EXIF)</h4>
                                    </div>
                                    <div className="ExifCard-Body">
                                        <div className="Exif-Row"><span className="label">Kamera</span><span className="value">{exif.camera}</span></div>
                                        <div className="Exif-Row"><span className="label">Lens</span><span className="value">{exif.lens}</span></div>
                                        <div className="Exif-StatsGrid">
                                            <div className="Exif-Row"><span className="label">Enstantane</span><span className="value">{exif.exposure}</span></div>
                                            <div className="Exif-Row"><span className="label">Diyafram</span><span className="value">{exif.aperture}</span></div>
                                            <div className="Exif-Row"><span className="label">ISO</span><span className="value">{exif.iso}</span></div>
                                            <div className="Exif-Row"><span className="label">Odak Uzaklığı</span><span className="value">{exif.focal}</span></div>
                                        </div>
                                    </div>
                                    <div className="Exif-Footer">
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                                            <div style={{display: 'flex', flexDirection: 'column'}}>
                                                <span className="label">Çekim Tarihi</span>
                                                <span className="value">{dateTaken}</span>
                                            </div>
                                            {(exif.lat && exif.lon) && (
                                                <a href={`http://googleusercontent.com/maps.google.com/?q=${exif.lat},${exif.lon}`} target="_blank" className="Button Button--primary" style={{fontSize: '12px', padding: '6px 12px', borderRadius: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', height: 'fit-content'}}>
                                                    {icon('fas fa-map-marker-alt')} Haritada Gör
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    <button className="OuterNav Next" onclick={(e) => { e.stopPropagation(); this.nextPost(e); }}>
                        {icon('fas fa-chevron-right')}
                    </button>
                </div>

                {currentPost.images.length > 1 && (
                    <div className="SpottersGallery-Filmstrip" onclick={(e) => e.stopPropagation()}>
                        {currentPost.images.map((img, idx) => (
                            <div 
                                className={`SpottersGallery-Thumb ${this.activeImageIndex === idx ? 'active' : ''}`}
                                onclick={(e) => this.setImageIndex(idx, e)}
                            >
                                <img src={this.getDisplayUrl(img)} alt="thumbnail" loading="lazy" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    view() {
        if (this.loadingGallery) {
            return <div style={{ padding: '40px 0' }}><LoadingIndicator /></div>;
        }

        if (this.galleryPosts.length === 0) {
            return (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted-color)' }}>
                    Bu kategoride henüz yüklenmiş bir fotoğraf bulunmuyor.
                </div>
            );
        }

        const gridClass = `LayoutA-Grid Grid-${this.layoutSetting}`;
        
        const hasMore = this.visibleLimit < this.galleryPosts.length;
        const canShowLess = this.visibleLimit > this.initialLimit;

        return (
            <div className="CustomHomepage-BottomArea" style={{ marginTop: '10px' }}>
                <div className={gridClass}>
                    {this.galleryPosts.slice(0, this.visibleLimit).map((post, index) => this.renderCard(post, index))}
                </div>
                
                {(hasMore || canShowLess) && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px', marginBottom: '20px' }}>
                        {hasMore && (
                            <Button className="Button Button--primary" onclick={() => this.loadMore()}>
                                Daha Fazla Göster
                            </Button>
                        )}
                        
                        {canShowLess && (
                            <Button className="Button" onclick={() => this.showLess()}>
                                Daha Azını Gör
                            </Button>
                        )}
                    </div>
                )}

                {this.lightboxOpen && this.renderLightbox()}
            </div>
        );
    }
}