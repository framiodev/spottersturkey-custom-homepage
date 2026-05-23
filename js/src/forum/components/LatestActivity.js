import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import avatar from 'flarum/common/helpers/avatar';
import username from 'flarum/common/helpers/username';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import icon from 'flarum/common/helpers/icon';

export default class LatestActivity extends Component {
    oninit(vnode) {
        super.oninit(vnode);
        this.groupedPosts = [];
        this.loading = true;

        this.fetchData();
    }

    fetchData() {
        app.store.find('posts', { 
            filter: { type: 'comment' }, 
            sort: '-createdAt', 
            limit: 40, 
            include: 'user,discussion' 
        }).then(posts => {
            const groups = [];
            const discMap = new Map();

            for (const post of posts) {
                const discussion = post.discussion();
                const user = post.user();
                
                if (!discussion || !user) continue;

                const discId = discussion.id();

                if (!discMap.has(discId)) {
                    if (groups.length >= 5) continue;

                    const newGroup = {
                        discussion: discussion,
                        latestPost: post,
                        mainUser: user, 
                        recentUsers: [user] 
                    };
                    groups.push(newGroup);
                    discMap.set(discId, newGroup);
                } else {
                    const group = discMap.get(discId);
                    if (group.recentUsers.length < 3 && !group.recentUsers.some(u => u.id() === user.id())) {
                        group.recentUsers.push(user);
                    }
                }
            }

            this.groupedPosts = groups;
            this.loading = false;
            m.redraw();

            // GİZLİ KAHRAMAN: Flarum önbelleğindeki (cache) "Cevap Sayısı 0/Boş" hatasını bulan ve onaran sistem.
            const missingDiscussions = groups.map(g => g.discussion).filter(d => d.replyCount() === undefined || d.replyCount() === null);
            if (missingDiscussions.length > 0) {
                Promise.all(missingDiscussions.map(d => app.store.find('discussions', d.id()))).then(() => {
                    m.redraw(); // Veriler tamamlanınca tabloyu sessizce günceller
                });
            }
        });
    }

    getPostSnippet(post) {
        if (!post) return 'Yeni mesaj';
        const html = post.contentHtml();
        if (!html) return 'Yeni mesaj';
        
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const lis = temp.querySelectorAll('li');
        
        if (lis.length >= 2) {
            let company = lis[0].textContent.trim();
            if (company.includes('|')) company = company.split('|')[0].trim();
            else if (company.includes(' - ')) company = company.split(' - ')[0].trim();
            return `${company} & ${lis[1].textContent.trim()}`;
        } else if (lis.length === 1) {
            return lis[0].textContent.trim();
        }
        
        return 'Fotoğraf eklendi';
    }

    view() {
        if (this.loading) {
            return (
                <div className="Framio-LatestTable-Wrapper">
                    <LoadingIndicator />
                </div>
            );
        }

        return (
            <div className="Framio-LatestTable-Wrapper">
                <div className="Framio-LatestTable-Header">
                    <h3>Son Gönderilen Mesajlar</h3>
                </div>
                <div className="Framio-LatestTable">
                    
                    <div className="TableRow TableHeader">
                        <div className="Col-User">KULLANICI</div>
                        <div className="Col-Snippet">İÇERİK BİLGİSİ</div>
                        <div className="Col-Subject">KONU BAŞLIĞI</div>
                        <div className="Col-Posters">SON YAZANLAR</div>
                        <div className="Col-Replies">CEVAP</div>
                    </div>

                    <div className="TableBody">
                        {this.groupedPosts.map(group => {
                            const discussion = group.discussion;
                            const latestPost = group.latestPost;
                            const mainUser = group.mainUser;
                            const snippet = this.getPostSnippet(latestPost);
                            
                            // Olimpiyat Dizilimi: En eski en sola, en yeni en sağa.
                            const overlapUsers = [...group.recentUsers].reverse();
                            
                            let replies = discussion.replyCount();
                            if (replies === undefined || replies === null) {
                                replies = '...'; // Yüklenirken sırıtmasın diye ... koyuyoruz, salise sonra sayı gelecek.
                            }

                            return (
                                <div className="TableRow" style={{ cursor: 'pointer' }} onclick={() => m.route.set(app.route.post(latestPost))}>
                                    
                                    <div className="Col-User">
                                        <Link href={app.route.user(mainUser)} className="AvatarWrapper" title={mainUser.displayName()} onclick={(e) => e.stopPropagation()}>
                                            {avatar(mainUser)}
                                        </Link>
                                        <Link href={app.route.user(mainUser)} className="UserName" title={mainUser.displayName()} style={{ textDecoration: 'none', color: 'inherit' }} onclick={(e) => e.stopPropagation()}>
                                            {username(mainUser)}
                                        </Link>
                                    </div>
                                    
                                    <div className="Col-Snippet">
                                        <span className="SnippetText" title={snippet}>{snippet}</span>
                                    </div>

                                    <div className="Col-Subject">
                                        <span className="SubjectTitle" title={discussion.title()}>{discussion.title()}</span>
                                    </div>

                                    <div className="Col-Posters">
                                        <div className="Avatar-Cluster">
                                            {overlapUsers.map(u => (
                                                <Link href={app.route.user(u)} className="Overlap-Avatar" title={u.displayName()} onclick={(e) => e.stopPropagation()}>
                                                    {avatar(u)}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="Col-Replies">
                                        {replies}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="TableFooter" style={{ padding: '12px 20px', textAlign: 'center', background: 'var(--control-bg)', borderTop: '1px solid var(--border-color)' }}>
                        <Link href={app.route('index')} className="Button Button--link" style={{ fontWeight: 'bold', color: 'var(--muted-color)', textDecoration: 'none' }}>
                            Tüm Tartışmaları Gör {icon('fas fa-angle-right')}
                        </Link>
                    </div>

                </div>
            </div>
        );
    }
}