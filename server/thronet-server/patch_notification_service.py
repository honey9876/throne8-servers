import re

with open("src/notifications/services/notification.service.ts", "r") as f:
    content = f.read()

# Import ProfilePhoto
imports = r"import Connection from '@/connections/models/Connection';\nimport User from '@/auth/models/User.model';\nimport ProfilePhoto from '@/Profile/models/ProfilePhoto.model';"
content = re.sub(r"import Connection from '@/connections/models/Connection';\nimport User from '@/auth/models/User.model';", imports, content)

# Patch posterPhoto
photo_pattern = r"const posterPhoto = poster\.profilePhotoId \|\| null;"
photo_replacement = r"""let posterPhoto = null;
            if (poster.profilePhotoId) {
                const photo = await ProfilePhoto.findOne({ photoId: poster.profilePhotoId }).lean();
                if (photo) {
                    posterPhoto = photo.cloudinarySecureUrl;
                }
            }"""
content = re.sub(photo_pattern, photo_replacement, content)

with open("src/notifications/services/notification.service.ts", "w") as f:
    f.write(content)
