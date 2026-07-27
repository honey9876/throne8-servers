$path = "src\Profile\services\activity\homePost.service.ts"
$content = Get-Content -Path $path -Raw

$oldImport = "import { Post, User, ProfilePhoto } from '@/shared/models/index.models';"
$newImport = "import { Post, User, ProfilePhoto, Comment } from '@/shared/models/index.models';"
$content = $content.Replace($oldImport, $newImport)

$oldBlock = @'
            // Un logon ke naam aur photo ek hi batch mein fetch karo
            let likerNamesMap: Record<string, string> = {};
            let likerAvatarsMap: Record<string, string | null> = {};
            if (allKnownLikerIds.size > 0) {
                const likerUsers = await User.find({ userId: { $in: [...allKnownLikerIds] } })
                    .lean()
                    .select('userId firstName lastName profilePhotoId');
                likerNamesMap = likerUsers.reduce((acc: Record<string, string>, u: any) => {
                    acc[u.userId] = `${u.firstName} ${u.lastName}`.trim();
                    return acc;
                }, {});

                const photoIds = likerUsers.map((u: any) => u.profilePhotoId).filter(Boolean);
                let photoMap: Record<string, string> = {};
                if (photoIds.length > 0) {
                    const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } })
                        .lean()
                        .select('photoId cloudinarySecureUrl');
                    photoMap = photos.reduce((acc: Record<string, string>, p: any) => {
                        acc[p.photoId] = p.cloudinarySecureUrl;
                        return acc;
                    }, {});
                }
                likerAvatarsMap = likerUsers.reduce((acc: Record<string, string | null>, u: any) => {
                    acc[u.userId] = u.profilePhotoId ? (photoMap[u.profilePhotoId] || null) : null;
                    return acc;
                }, {});
            }

            allPosts = allPosts.map((post) => {
                const knownLikerIds = likedByConnectionsMap[post.entryId] || [];
                const likedByConnections = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerNamesMap[id])
                    .filter(Boolean);
                const likedByConnectionsAvatars = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerAvatarsMap[id] || null);
                const likedByConnectionsFull = knownLikerIds
                    .map((id) => ({
                        userId: id,
                        name: likerNamesMap[id],
                        avatar: likerAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);

                return {
                    ...post,
                    connectionStatus:
                        post.userId === currentUserId ? 'self' : connectionStatusMap[post.userId] || 'none',
                    likedByConnections,
                    likedByConnectionsAvatars,
                    likedByConnectionsCount: knownLikerIds.length,
                    likedByConnectionsFull,
                };
            });
'@

$newBlock = @'
            // Un logon ke naam aur photo ek hi batch mein fetch karo
            let likerNamesMap: Record<string, string> = {};
            let likerAvatarsMap: Record<string, string | null> = {};
            if (allKnownLikerIds.size > 0) {
                const likerUsers = await User.find({ userId: { $in: [...allKnownLikerIds] } })
                    .lean()
                    .select('userId firstName lastName profilePhotoId');
                likerNamesMap = likerUsers.reduce((acc: Record<string, string>, u: any) => {
                    acc[u.userId] = `${u.firstName} ${u.lastName}`.trim();
                    return acc;
                }, {});

                const photoIds = likerUsers.map((u: any) => u.profilePhotoId).filter(Boolean);
                let photoMap: Record<string, string> = {};
                if (photoIds.length > 0) {
                    const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } })
                        .lean()
                        .select('photoId cloudinarySecureUrl');
                    photoMap = photos.reduce((acc: Record<string, string>, p: any) => {
                        acc[p.photoId] = p.cloudinarySecureUrl;
                        return acc;
                    }, {});
                }
                likerAvatarsMap = likerUsers.reduce((acc: Record<string, string | null>, u: any) => {
                    acc[u.userId] = u.profilePhotoId ? (photoMap[u.profilePhotoId] || null) : null;
                    return acc;
                }, {});
            }

            // "Commented by connections you know" - same pattern like likes ke liye
            const entryIds = allPosts.map((post) => post.entryId);
            const commentedByConnectionsMap: Record<string, string[]> = {};
            const allKnownCommenterIds = new Set<string>();

            if (entryIds.length > 0) {
                const comments = await Comment.find({
                    postId: { $in: entryIds },
                    isDeleted: false,
                }).lean().select('postId userId');

                const commentersByPost: Record<string, Set<string>> = {};
                comments.forEach((c: any) => {
                    if (!commentersByPost[c.postId]) commentersByPost[c.postId] = new Set();
                    if (connectionIdsSet.has(c.userId)) {
                        commentersByPost[c.postId].add(c.userId);
                    }
                });

                Object.keys(commentersByPost).forEach((postId) => {
                    const ids = [...commentersByPost[postId]];
                    commentedByConnectionsMap[postId] = ids;
                    ids.forEach((id) => allKnownCommenterIds.add(id));
                });
            }

            let commenterNamesMap: Record<string, string> = {};
            let commenterAvatarsMap: Record<string, string | null> = {};
            if (allKnownCommenterIds.size > 0) {
                const commenterUsers = await User.find({ userId: { $in: [...allKnownCommenterIds] } })
                    .lean()
                    .select('userId firstName lastName profilePhotoId');
                commenterNamesMap = commenterUsers.reduce((acc: Record<string, string>, u: any) => {
                    acc[u.userId] = `${u.firstName} ${u.lastName}`.trim();
                    return acc;
                }, {});

                const commenterPhotoIds = commenterUsers.map((u: any) => u.profilePhotoId).filter(Boolean);
                let commenterPhotoMap: Record<string, string> = {};
                if (commenterPhotoIds.length > 0) {
                    const commenterPhotos = await ProfilePhoto.find({ photoId: { $in: commenterPhotoIds } })
                        .lean()
                        .select('photoId cloudinarySecureUrl');
                    commenterPhotoMap = commenterPhotos.reduce((acc: Record<string, string>, p: any) => {
                        acc[p.photoId] = p.cloudinarySecureUrl;
                        return acc;
                    }, {});
                }
                commenterAvatarsMap = commenterUsers.reduce((acc: Record<string, string | null>, u: any) => {
                    acc[u.userId] = u.profilePhotoId ? (commenterPhotoMap[u.profilePhotoId] || null) : null;
                    return acc;
                }, {});
            }

            allPosts = allPosts.map((post) => {
                const knownLikerIds = likedByConnectionsMap[post.entryId] || [];
                const likedByConnections = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerNamesMap[id])
                    .filter(Boolean);
                const likedByConnectionsAvatars = knownLikerIds
                    .slice(0, 3)
                    .map((id) => likerAvatarsMap[id] || null);
                const likedByConnectionsFull = knownLikerIds
                    .map((id) => ({
                        userId: id,
                        name: likerNamesMap[id],
                        avatar: likerAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);

                const knownCommenterIds = commentedByConnectionsMap[post.entryId] || [];
                const commentedByConnections = knownCommenterIds
                    .slice(0, 3)
                    .map((id) => commenterNamesMap[id])
                    .filter(Boolean);
                const commentedByConnectionsAvatars = knownCommenterIds
                    .slice(0, 3)
                    .map((id) => commenterAvatarsMap[id] || null);
                const commentedByConnectionsFull = knownCommenterIds
                    .map((id) => ({
                        userId: id,
                        name: commenterNamesMap[id],
                        avatar: commenterAvatarsMap[id] || null,
                    }))
                    .filter((x) => x.name);

                return {
                    ...post,
                    connectionStatus:
                        post.userId === currentUserId ? 'self' : connectionStatusMap[post.userId] || 'none',
                    likedByConnections,
                    likedByConnectionsAvatars,
                    likedByConnectionsCount: knownLikerIds.length,
                    likedByConnectionsFull,
                    commentedByConnections,
                    commentedByConnectionsAvatars,
                    commentedByConnectionsCount: knownCommenterIds.length,
                    commentedByConnectionsFull,
                };
            });
'@

if ($content.Contains($oldBlock)) {
    $content = $content.Replace($oldBlock, $newBlock)
    Set-Content -Path $path -Value $content -NoNewline
    Write-Host "SUCCESS: File updated with comment feature" -ForegroundColor Green
} else {
    Write-Host "ERROR: Expected block not found. File may not match previous patch. Paste current file content and I will re-check." -ForegroundColor Red
}