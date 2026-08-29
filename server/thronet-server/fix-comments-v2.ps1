$path = "src\Profile\services\activity\homePost.service.ts"
$content = Get-Content -Path $path -Raw

# 1. Add Comment to import
$oldImport = "import { Post, User, ProfilePhoto } from '@/shared/models/index.models';"
$newImport = "import { Post, User, ProfilePhoto, Comment } from '@/shared/models/index.models';"
if (-not $content.Contains($oldImport)) {
    Write-Host "FAIL at step 1 (import)" -ForegroundColor Red
    exit
}
$content = $content.Replace($oldImport, $newImport)

# 2. Insert comment-fetching setup BEFORE the allPosts.map() call
$anchorA = "            allPosts = allPosts.map((post) => {`r`n                const knownLikerIds = likedByConnectionsMap[post.entryId] || [];"
if (-not $content.Contains($anchorA)) {
    Write-Host "FAIL at step 2 (anchorA not found)" -ForegroundColor Red
    exit
}
$insertA = @'
            // Commented by connections you know
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

'@
$content = $content.Replace($anchorA, $insertA + $anchorA)

# 3. Insert commenter computation INSIDE the map callback, after likedByConnectionsAvatars
$anchorB = "                const likedByConnectionsAvatars = knownLikerIds`r`n                    .slice(0, 3)`r`n                    .map((id) => likerAvatarsMap[id] || null);"
if (-not $content.Contains($anchorB)) {
    Write-Host "FAIL at step 3 (anchorB not found)" -ForegroundColor Red
    exit
}
$insertB = @'


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
'@
$content = $content.Replace($anchorB, $anchorB + $insertB)

# 4. Insert new fields into the return object, after likedByConnectionsCount line
$anchorC = "                    likedByConnectionsCount: knownLikerIds.length, // total connections who liked"
if (-not $content.Contains($anchorC)) {
    Write-Host "FAIL at step 4 (anchorC not found)" -ForegroundColor Red
    exit
}
$insertC = @'


                    commentedByConnections,
                    commentedByConnectionsAvatars,
                    commentedByConnectionsCount: knownCommenterIds.length,
                    commentedByConnectionsFull,
'@
$content = $content.Replace($anchorC, $anchorC + $insertC)

Set-Content -Path $path -Value $content -NoNewline
Write-Host "SUCCESS: All 4 steps applied" -ForegroundColor Green