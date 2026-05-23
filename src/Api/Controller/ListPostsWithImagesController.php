<?php

namespace Framio\CustomHomepage\Api\Controller;

use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Flarum\Post\Post;
use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Contracts\Cache\Repository as Cache;

class ListPostsWithImagesController implements RequestHandlerInterface
{
    protected $db;
    protected $cache;

    public function __construct(ConnectionInterface $db, Cache $cache)
    {
        $this->db = $db;
        $this->cache = $cache;
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        $query = Post::whereVisibleTo($actor)
            ->where('type', 'comment')
            ->where(function ($q) {
                $q->where('content', 'like', '%<img%')
                  ->orWhere('content', 'like', '%[spotter-image%')
                  ->orWhere('content', 'like', '%![%')
                  ->orWhere('content', 'like', '%[img]%');
            })
            ->orderBy('created_at', 'desc')
            ->limit(60);

        $posts = $query->get();

        $exifMap = $this->cache->remember('framio_spotters_exif_map', 600, function() {
            $map = [];
            try {
                $images = $this->db->table('spotter_images')->orderBy('id', 'desc')->limit(1000)->get(['id', 'exif_data', 'thumb_path', 'path']);
                
                foreach ($images as $img) {
                    if (!empty($img->exif_data)) {
                        $map['id_' . $img->id] = $img->exif_data;
                        
                        if (!empty($img->thumb_path)) {
                            $filename = basename($img->thumb_path);
                            $map['file_' . $filename] = $img->exif_data;
                            $map['path_' . $img->thumb_path] = $img->exif_data;
                        }
                        
                        if (!empty($img->path)) {
                            $filename = basename($img->path);
                            $map['file_' . $filename] = $img->exif_data;
                        }
                    }
                }
            } catch (\Exception $e) {}
            return $map;
        });

        $data = [];
        $included = [];

        foreach ($posts as $post) {
            $data[] = [
                'type' => 'posts',
                'id' => (string) $post->id,
                'attributes' => [
                    'content' => $post->content,
                    'contentHtml' => clone $post->contentHtml ?? '',
                    'createdAt' => clone $post->created_at,
                ],
                'relationships' => [
                    'user' => [
                        'data' => $post->user_id ? ['type' => 'users', 'id' => (string) $post->user_id] : null
                    ],
                    'discussion' => [
                        'data' => $post->discussion_id ? ['type' => 'discussions', 'id' => (string) $post->discussion_id] : null
                    ]
                ]
            ];

            if ($post->user) {
                $included['user_' . $post->user_id] = [
                    'type' => 'users',
                    'id' => (string) $post->user_id,
                    'attributes' => [
                        'username' => $post->user->username,
                        'displayName' => $post->user->display_name,
                        'avatarUrl' => $post->user->avatar_url,
                        'slug' => $post->user->slug
                    ]
                ];
            }

            if ($post->discussion) {
                $discussion = $post->discussion;
                $included['discussion_' . $discussion->id] = [
                    'type' => 'discussions',
                    'id' => (string) $discussion->id,
                    'attributes' => [
                        'title' => $discussion->title,
                        'slug' => $discussion->slug
                    ]
                ];
            }
        }

        return new JsonResponse([
            'data' => $data,
            'included' => array_values($included),
            'meta' => ['spotterExifMap' => $exifMap]
        ]);
    }
}