import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import icon from 'flarum/common/helpers/icon';

export default class CustomHomepage extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.galleryPosts = [];
        this.loadingGallery = true;
        this.visibleLimit = 6;
        
        this.galleryMode = app.forum.attribute('framioCustomHomepageGalleryMode') || 'recent';
        this.clickBehavior = app.forum.attribute('framioCustomHomepageClickBehavior') || 'lightbox';
        
        this.curatedIds = JSON.parse(app.forum.attribute('framioCustomHomepageCurated') || '[]');
        
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
        const cachedData = localStorage.getItem('framioUlasimGallery_v5');
        
        if (cachedData) {
            try {
                this.galleryPosts = JSON.parse(cachedData);
                this.loadingGallery = false;
                m.redraw();
            } catch(e) {}
        }

        this.loadGalleryImagesParallel(!!cachedData);
    }

    async loadGalleryImagesParallel(isSilent) {
        try {
            const postPromises = [];
            for (let i = 0; i < 10; i++) { 
                postPromises.push(app.request({
                    method: 'GET',
                    url: app.forum.attribute('apiUrl') + '/posts',
                    params: { filter: { type: 'comment' }, sort: '-createdAt', include: 'discussion', page: { limit: 50, offset: i * 50 } } 
                }).catch(() => ({ data: [] })));
            }

            const imgPromises = [];
            for (let i = 0; i < 6; i++) { 
                imgPromises.push(app.request({
                    method: 'GET',
                    url: app.forum.attribute('apiUrl') + '/spotter-images',
                    params: { page: { limit: 50, offset: i * 50 } } 
                }).catch(() => ({ data: [] })));
            }

            const customResPromise = app.request({
                method: 'GET',
                url: app.forum.attribute('apiUrl') + '/framio/homepage-posts',
                params: { include: 'discussion', page: { limit: 100 } }
            }).catch(() => ({ data: [], meta: {} }));

            const [postResults, imgResults, customRes] = await Promise.all([
                Promise.all(postPromises),
                Promise.all(imgPromises),
                customResPromise
            ]);

            let rawPosts = customRes.data || [];
            const metaExif = (customRes.meta && customRes.meta.spotterExifMap) ? customRes.meta.spotterExifMap : {};

            for (const res of postResults) {
                if (res && res.data) rawPosts = rawPosts.concat(res.data);
            }

            let rawImages = [];
            for (const res of imgResults) {
                if (res && res.data) rawImages = rawImages.concat(res.data);
            }

            const uniquePosts = [];
            const seenPostIds = new Set();
            for (const p of rawPosts) {
                if (!seenPostIds.has(p.id)) {
                    seenPostIds.add(p.id);
                    uniquePosts.push(p);
                }
            }
            rawPosts = uniquePosts;

            const imageMap = new Map();
            for (const img of rawImages) {
                imageMap.set(String(img.id), img);
            }

            const groupedPosts = [];
            const processedImageIds = new Set();

            const extractBaseName = (url) => {
                if (!url) return '';
                let fileName = url.split('/').pop().split('?')[0];
                try { fileName = decodeURIComponent(fileName); } catch(e) {}
                return fileName.replace(/^thumb_/i, '').trim(); 
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
                // SADECE HTML FORMATINA ODAKLANIYORUZ (Sırrı çözen kısım burası!)
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

                // BBCODE TARAYICI BURADAN SİLİNDİ, RİSK SIFIRLANDI!
                // Yalnızca render edilmiş kusursuz HTML hedefleniyor.
                const imgRegex = /<img[^>]+src=["']?([^"'>]+)["']?/gi;
                let match;
                while ((match = imgRegex.exec(contentHtml)) !== null) {
                    addImage(null, match[1]);
                }

                if (postImages.length > 0) {
                    let existingGroup = groupedPosts.find(g => g.real_post_id === post.id);

                    if (existingGroup) {
                        postImages.forEach(newImg => {
                            const newUrl = cleanUrlFn((newImg.attributes ? newImg.attributes.url : newImg.url) || '');
                            const newBase = extractBaseName(newUrl);
                            const isDuplicate = existingGroup.images.some(exImg => {
                                const exUrl = cleanUrlFn((exImg.attributes ? exImg.attributes.url : exImg.url) || '');
                                return extractBaseName(exUrl) === newBase;
                            });
                            if (!isDuplicate) existingGroup.images.push(newImg);
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

            const fallbackGroups = new Map();
            for (const img of rawImages) {
                if (!processedImageIds.has(String(img.id))) {
                    const attr = img.attributes || img;
                    let real_pid = attr.postId || attr.post_id || (img.relationships?.post?.data?.id);
                    let disc_id = attr.discussionId || attr.discussion_id || (img.relationships?.discussion?.data?.id);
                    let post_num = attr.number || attr.postNumber || attr.post_number || null;
                    
                    let timeStr = attr.createdAt || attr.created_at || '';
                    let minuteGroup = timeStr ? timeStr.substring(0, 16) : 'none'; 
                    
                    let timestampMatch = (attr.url || '').match(/(?:thumb_)?(\d{10})_/);
                    let uploadBatch = timestampMatch ? Math.floor(parseInt(timestampMatch[1]) / 60) : null;

                    let groupId;
                    if (real_pid) {
                        groupId = `post_${real_pid}`;
                    } else {
                        let batchKey = uploadBatch || minuteGroup;
                        if (disc_id) {
                            groupId = `disc_${disc_id}_${batchKey}`;
                        } else if (uploadBatch) {
                            groupId = `batch_${uploadBatch}`; 
                        } else {
                            groupId = `img_${img.id}`;
                        }
                    }
                    
                    if (!fallbackGroups.has(groupId)) {
                        fallbackGroups.set(groupId, {
                            group_id: groupId,
                            real_post_id: real_pid,
                            discussion_id: disc_id,
                            post_number: post_num,
                            images: [],
                            postContentHtml: null,
                            postContentLoading: false,
                            postContentLoaded: false
                        });
                    }
                    
                    const group = fallbackGroups.get(groupId);
                    const imgUrl = cleanUrlFn(attr.url || '');
                    const imgBase = extractBaseName(imgUrl);
                    const isDuplicate = group.images.some(exImg => {
                        const exUrl = cleanUrlFn((exImg.attributes ? exImg.attributes.url : exImg.url) || '');
                        return extractBaseName(exUrl) === imgBase;
                    });
                    
                    if (!isDuplicate) {
                        group.images.push(img);
                    }
                }
            }

            let allGroups = groupedPosts.concat(Array.from(fallbackGroups.values()));

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

            if (this.galleryMode === 'curated' && this.curatedIds.length > 0) {
                allGroups = allGroups.filter(post => 
                    post.images.some(img => this.curatedIds.includes(String(img.id)) || this.curatedIds.includes(parseInt(img.id)))
                );
            }

            this.galleryPosts = allGroups;
            
            try {
                localStorage.setItem('framioUlasimGallery_v5', JSON.stringify(this.galleryPosts));
            } catch(e) {}

            if (!isSilent) {
                this.loadingGallery = false;
            }
            m.redraw();
        } catch (error) {
            if (!isSilent) {
                this.loadingGallery = false;
                m.redraw();
            }
        }
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
        temp.innerHTML = post.postContentHtml.replace(/<img[^>]*>/gi, '').replace(/<figure[^>]*>.*?<\/figure>/gi, '');
        
        const lis = temp.querySelectorAll('li');
        if (lis.length >= 2) {
            let company = lis[0].textContent.trim();
            if (company.includes('|')) company = company.split('|')[0].trim();
            else if (company.includes(' - ')) company = company.split(' - ')[0].trim();
            return `${company} & ${lis[1].textContent.trim()}`;
        } else if (lis.length === 1) {
            return lis[0].textContent.trim();
        }

        const strongs = temp.querySelectorAll('strong, b');
        if (strongs.length >= 2) {
            let company = strongs[0].textContent.trim();
            if (company.includes('|')) company = company.split('|')[0].trim();
            else if (company.includes(' - ')) company = company.split(' - ')[0].trim();
            return `${company} & ${strongs[1].textContent.trim()}`;
        }

        const htmlLines = temp.innerHTML.split(/<br\s*\/?>|<\/p>|<\/div>|\n/i);
        const textLines = htmlLines.map(l => {
            const div = document.createElement('div');
            div.innerHTML = l;
            return div.textContent.trim().replace(/^[-•*]+\s*/, '').trim(); 
        }).filter(l => l.length > 2 && !l.includes('[spotter'));

        if (textLines.length >= 2) {
            let company = textLines[0];
            if (company.includes('|')) company = company.split('|')[0].trim();
            else if (company.includes(' - ')) company = company.split(' - ')[0].trim();
            return `${company} & ${textLines[1]}`;
        }

        return cleanFallback;
    }

    loadMore() {
        this.visibleLimit += 6;
        m.redraw();
    }

    handlePostClick(e, postIndex) {
        e.preventDefault();
        const post = this.galleryPosts[postIndex];
        const discussionId = post.discussion_id;
        const postNumber = post.post_number;
        
        if (this.clickBehavior === 'link' && discussionId) {
            let routeUrl = app.route('discussion', { id: discussionId });
            if (postNumber) {
                routeUrl += '/' + postNumber;
            }
            m.route.set(routeUrl);
        } else {
            this.activePostIndex = postIndex;
            this.activeImageIndex = 0;
            this.lightboxOpen = true;
            this.infoPanelOpen = false;
            this.shareOpen = false;
            $('body').addClass('SpottersGallery-NoScroll');
            this.fetchPostContent(post);
            m.redraw();
        }
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
        
        // EĞER API'DEN GELEN NATIVE EXIF VARSA ONU KULLANMAK İÇİN GÜVENLİK AĞI!
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
        return (
            <div className="container">
                <div className="CustomHomepage-BottomArea">
                    <h3 className="LayoutA-SectionTitle">Son Eklenenler</h3>
                    
                    {this.loadingGallery ? (
                        <p>Fotoğraflar yükleniyor...</p>
                    ) : this.galleryPosts.length > 0 ? (
                        <>
                            <div className="LayoutA-Grid">
                                {this.galleryPosts.slice(0, this.visibleLimit).map((post, index) => this.renderCard(post, index))}
                            </div>
                            {this.visibleLimit < this.galleryPosts.length && (
                                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                                    <Button className="Button Button--primary" onclick={() => this.loadMore()}>
                                        Daha Fazla Göster
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <p>Henüz fotoğraf bulunmuyor.</p>
                    )}

                    {this.lightboxOpen && this.renderLightbox()}
                </div>
            </div>
        );
    }
}