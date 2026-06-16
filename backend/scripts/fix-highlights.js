require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Highlight = require('../src/models/Highlight');
const Story = require('../src/models/Story');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  
  const highlights = await Highlight.find({});
  let fixed = 0;
  let deleted = 0;

  for (const h of highlights) {
    const items = h.items || [];
    const stories = h.stories || [];

    // Delete empty highlights
    if (items.length === 0 && stories.length === 0) {
      await Highlight.findByIdAndDelete(h._id);
      console.log('Deleted empty highlight:', h._id, h.title);
      deleted++;
      continue;
    }

    let needsUpdate = false;

    // Fix items that have imageUrl but no mediaUrl
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || typeof it === 'string') continue;
      
      if ((it.imageUrl || it.videoUrl) && !it.mediaUrl) {
        items[i].mediaUrl = it.imageUrl || it.videoUrl;
        needsUpdate = true;
        console.log('  Fixed mediaUrl for item', it.id || it.storyId, 'in highlight', h.title);
      }
    }

    // Try to upgrade bare string IDs to snapshots by looking up the Story
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (typeof it === 'string' && mongoose.Types.ObjectId.isValid(it)) {
        try {
          const Story = mongoose.model('Story');
          const st = await Story.findById(it).lean();
          if (st) {
            items[i] = {
              id: String(st._id),
              storyId: String(st._id),
              userId: st.userId,
              userName: st.userName,
              userAvatar: st.userAvatar,
              imageUrl: st.image || null,
              videoUrl: st.video || null,
              mediaUrl: st.image || st.video || null,
              mediaType: st.video ? 'video' : 'image',
              createdAt: st.createdAt || new Date(),
            };
            needsUpdate = true;
            console.log('  Upgraded bare string to snapshot:', it, 'in highlight', h.title);
          } else {
            // Story expired - remove the bare string since it's useless
            items.splice(i, 1);
            i--;
            needsUpdate = true;
            console.log('  Removed expired bare string:', it, 'from highlight', h.title);
          }
        } catch (e) {
          console.log('  Could not lookup story:', it, e.message);
        }
      }
    }

    if (needsUpdate) {
      h.items = items;
      h.markModified('items');
      await h.save();
      fixed++;
      console.log('Saved highlight:', h._id, h.title);
    }
  }

  console.log('\n=== Summary ===');
  console.log('Fixed:', fixed, 'highlights');
  console.log('Deleted:', deleted, 'empty highlights');
  
  // Verify final state
  const remaining = await Highlight.find({}).lean();
  console.log('\nRemaining highlights:', remaining.length);
  for (const h of remaining) {
    console.log('  -', h.title, '| items:', (h.items||[]).length, '| stories:', (h.stories||[]).length);
    for (const it of (h.items || [])) {
      if (typeof it === 'string') {
        console.log('    BARE STRING:', it);
      } else {
        console.log('    OBJ:', it.id, 'imageUrl:', it.imageUrl ? 'YES' : 'NO', 'mediaUrl:', it.mediaUrl ? 'YES' : 'NO');
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
