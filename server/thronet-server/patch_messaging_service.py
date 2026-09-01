import re

with open("src/message/services/messaging.service.ts", "r") as f:
    content = f.read()

# Add ProfilePhoto import
imports = r"import { LoggerUtil as logger } from '../../shared/logger.util';\nimport { conversationRepo, messageRepo } from '../repository/messaging.repository';\nimport User from '../../auth/models/User.model';\nimport ProfilePhoto from '../../Profile/models/ProfilePhoto.model';"
content = re.sub(r"import { LoggerUtil as logger }.*?\nimport User from '../../auth/models/User.model';", imports, content, flags=re.DOTALL)

# Patch getConversations
get_conv_pattern = r"(// Map users by their UUID for quick lookup\n\s*const userMap = new Map\(\);\n\s*users\.forEach\(\(u: any\) => userMap\.set\(u\.userId, u\)\);)"
get_conv_replacement = r"""\1

        const photoIds = users.map((u: any) => u.profilePhotoId).filter(Boolean);
        let photoMap = new Map();
        if (photoIds.length > 0) {
            const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } }).lean();
            photos.forEach((p: any) => photoMap.set(p.photoId, p.cloudinarySecureUrl));
        }"""
content = re.sub(get_conv_pattern, get_conv_replacement, content, count=1)

# Inside map for getConversations
map1_pattern = r"profileImage: u\.profilePhotoId,\n\s*avatar: u\.profilePhotoId,"
map1_replacement = r"""profileImage: u.profilePhotoId ? photoMap.get(u.profilePhotoId) : null,
                    avatar: u.profilePhotoId ? photoMap.get(u.profilePhotoId) : null,"""
content = re.sub(map1_pattern, map1_replacement, content, count=1)


# Patch getOrCreateDirectConversation
get_direct_pattern = r"(const userMap = new Map\(\);\n\s*users\.forEach\(\(u: any\) => userMap\.set\(u\.userId, u\)\);)"
get_direct_replacement = r"""\1

        const photoIds = users.map((u: any) => u.profilePhotoId).filter(Boolean);
        let photoMap = new Map();
        if (photoIds.length > 0) {
            const photos = await ProfilePhoto.find({ photoId: { $in: photoIds } }).lean();
            photos.forEach((p: any) => photoMap.set(p.photoId, p.cloudinarySecureUrl));
        }"""
content = re.sub(get_direct_pattern, get_direct_replacement, content, count=1)

# Inside map for getOrCreateDirectConversation
content = re.sub(map1_pattern, map1_replacement, content, count=1)

with open("src/message/services/messaging.service.ts", "w") as f:
    f.write(content)
