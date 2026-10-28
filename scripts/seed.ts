// Qalb — Database seed: verified Naat/Hamd/Qawwali tracks, store products, playlists, app version
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const TRACKS = [
  {
    videoId: 'KfXIF2Mm2Kc',
    title: 'Insha Allah | Official Music Video',
    artist: 'Maher Zain',
    category: 'NASHEED',
    tags: 'maher zain,insha allah,insya allah,nasheed,awakening,ramadan',
    trending: true,
    playCount: 110700000,
  },
  {
    videoId: 'qpYVyEoXEGs',
    title: 'Hasbi Rabbi | Official Music Video',
    artist: 'Sami Yusuf',
    category: 'NASHEED',
    tags: 'sami yusuf,hasbi rabbi,nasheed,islamic,awakening',
    trending: true,
    playCount: 20900000,
  },
  {
    videoId: '-35IQq0vd34',
    title: 'Tajdar-e-Haram | Naat',
    artist: 'Atif Aslam',
    category: 'NAAT',
    tags: 'atif aslam,tajdar e haram,naat,coke studio,qawwali,kalam',
    trending: true,
    playCount: 250000000,
  },
  {
    videoId: 'SDfELfpumEE',
    title: 'Mustt Mustt (Live)',
    artist: 'Nusrat Fateh Ali Khan',
    category: 'QAWWALI',
    tags: 'nusrat fateh ali khan,mustt mustt,qawwali,sufi,live,real world',
    trending: true,
    playCount: 15000000,
  },
  {
    videoId: 'wjynrRhztU8',
    title: 'Allah Hoo | Sufi Qawwali',
    artist: 'Nusrat Fateh Ali Khan',
    category: 'HAMD',
    tags: 'nusrat fateh ali khan,allah hoo,hamd,qawwali,sufi,osa islamic',
    trending: true,
    playCount: 30000000,
  },
  {
    videoId: 'tn13eMHrszk',
    title: 'Lam Yati Nazeeroka Fi Nazrin | Full Naat',
    artist: 'Owais Raza Qadri',
    category: 'NAAT',
    tags: 'owais raza qadri,lam yati nazeeroka,naat sharif,urdu naat',
    trending: true,
    playCount: 8000000,
  },
]

const PLAYLISTS = [
  {
    slug: 'trending-kalam',
    name: 'Trending Kalam',
    description: 'Sab se suniye jaane wale naat, hamd aur qawwali',
    coverEmoji: '🌟',
    accentColor: '#10B981',
    featured: true,
    sortOrder: 1,
    trackIdx: [0, 1, 2, 3, 4, 5],
  },
  {
    slug: 'hamd-o-sana',
    name: 'Hamd-o-Sana',
    description: 'Allah Ta\'ala ki hamd mein kalaam',
    coverEmoji: '🤲',
    accentColor: '#D4A937',
    featured: true,
    sortOrder: 2,
    trackIdx: [4, 0, 1],
  },
  {
    slug: 'naat-sharif',
    name: 'Naat Sharif',
    description: 'Rasoolullah ﷺ ke pyare naat',
    coverEmoji: '🕌',
    accentColor: '#34D399',
    featured: true,
    sortOrder: 3,
    trackIdx: [2, 5, 1],
  },
  {
    slug: 'sufi-qawwali',
    name: 'Sufi Qawwali',
    description: 'Ruhani sufi qawwaliyan',
    coverEmoji: '🎵',
    accentColor: '#0EA47A',
    featured: true,
    sortOrder: 4,
    trackIdx: [3, 4, 2],
  },
]

const PRODUCTS = [
  {
    name: 'Royal Oud Attar',
    description: 'Khalis oud-based attar — gehri, gehri mehndi aur oud ke saath. 12ml roll-on.',
    price: 2450,
    originalPrice: 3200,
    category: 'ATTAR',
    emoji: '🧴',
    gradient: 'from-amber-900 to-emerald-950',
    rating: 4.8,
    reviews: 214,
    featured: true,
  },
  {
    name: 'Musk-e-Tahara Attar',
    description: 'Halka musk attar, roz namaz ke liye perfect. Alcohol-free. 12ml.',
    price: 1650,
    originalPrice: null,
    category: 'ATTAR',
    emoji: '🌸',
    gradient: 'from-rose-900 to-emerald-950',
    rating: 4.7,
    reviews: 156,
  },
  {
    name: 'Zafran Attar Blend',
    description: 'Zafran aur agarwood ka khaas blend — jumma ke liye khaas. 12ml.',
    price: 3200,
    originalPrice: 4100,
    category: 'ATTAR',
    emoji: '💛',
    gradient: 'from-yellow-800 to-emerald-950',
    rating: 4.9,
    reviews: 98,
  },
  {
    name: 'Khalis Amber Tasbeeh (99 Beads)',
    description: 'Asli amber resin ke 99 beads, silk tassel ke saath. Haath-se-tayar.',
    price: 5800,
    originalPrice: 7500,
    category: 'TASBEEH',
    emoji: '📿',
    gradient: 'from-orange-900 to-emerald-950',
    rating: 4.9,
    reviews: 342,
    featured: true,
  },
  {
    name: 'Olive Wood Tasbeeh (33 Beads)',
    description: 'Halka olive wood tasbeeh — safar ke liye behtareen. 33 beads.',
    price: 1900,
    originalPrice: null,
    category: 'TASBEEH',
    emoji: '🪵',
    gradient: 'from-lime-900 to-emerald-950',
    rating: 4.6,
    reviews: 121,
  },
  {
    name: 'Turkish Velvet Prayer Mat',
    description: 'Istanbul-style makhmali jaanamaz, compass marker ke saath. 70x110cm.',
    price: 3400,
    originalPrice: 4200,
    category: 'PRAYER_MAT',
    emoji: '🧎',
    gradient: 'from-teal-900 to-emerald-950',
    rating: 4.8,
    reviews: 267,
    featured: true,
  },
  {
    name: 'Masjid Al-Haram Foam Mat',
    description: 'Folding foam jaanamaz — pocket friendly, carry pouch muft.',
    price: 2200,
    originalPrice: null,
    category: 'PRAYER_MAT',
    emoji: '🕋',
    gradient: 'from-stone-800 to-emerald-950',
    rating: 4.7,
    reviews: 189,
  },
  {
    name: 'Seerah-un-Nabi ﷺ (3 Volume Set)',
    description: 'Maulana Idrees Kandhlawi ki mash-hoor seerah — Urdu tarjuma, hardbound.',
    price: 4900,
    originalPrice: 6000,
    category: 'BOOKS',
    emoji: '📚',
    gradient: 'from-sky-900 to-emerald-950',
    rating: 5.0,
    reviews: 76,
  },
  {
    name: 'Fazail-e-Amaal (Urdu)',
    description: 'Tableeghi nisab — Urdu edition, premium quality paper.',
    price: 1600,
    originalPrice: null,
    category: 'BOOKS',
    emoji: '📖',
    gradient: 'from-green-900 to-emerald-950',
    rating: 4.8,
    reviews: 412,
  },
  {
    name: 'Embroidered Namaz Cap (Topi)',
    description: 'Sufi-style dhaga-kari topi — cotton, saans lene ke qabil. Free size.',
    price: 850,
    originalPrice: 1200,
    category: 'CAPS',
    emoji: '🧢',
    gradient: 'from-white/20 to-emerald-950',
    rating: 4.5,
    reviews: 203,
  },
  {
    name: 'Kiswa Frame Piece',
    description: 'Khana Kaaba ki asli kiswa ka chhota tukda — golden frame ke saath.',
    price: 12500,
    originalPrice: null,
    category: 'GIFTS',
    emoji: '🖤',
    gradient: 'from-neutral-800 to-emerald-950',
    rating: 5.0,
    reviews: 41,
    featured: true,
  },
  {
    name: 'Aqeeq Stone Ring',
    description: 'Yemeni aqeeq (agate) stone — chandi ki ring, hijri engraving option.',
    price: 7800,
    originalPrice: 9500,
    category: 'GIFTS',
    emoji: '💍',
    gradient: 'from-red-900 to-emerald-950',
    rating: 4.9,
    reviews: 88,
  },
]

async function main() {
  console.log('🌱 Seeding Qalb database...')

  await db.playlistItem.deleteMany()
  await db.playlist.deleteMany()
  await db.track.deleteMany()
  await db.product.deleteMany()
  await db.appVersion.deleteMany()

  const createdTracks = []
  for (const t of TRACKS) {
    const track = await db.track.create({
      data: {
        ...t,
        thumbnailUrl: `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
        verified: true,
      },
    })
    createdTracks.push(track)
  }
  console.log(`  ✅ ${createdTracks.length} tracks`)

  for (const p of PLAYLISTS) {
    await db.playlist.create({
      data: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        coverEmoji: p.coverEmoji,
        accentColor: p.accentColor,
        featured: p.featured,
        sortOrder: p.sortOrder,
        items: {
          create: p.trackIdx.map((idx, pos) => ({
            trackId: createdTracks[idx].id,
            position: pos,
          })),
        },
      },
    })
  }
  console.log(`  ✅ ${PLAYLISTS.length} playlists`)

  for (const pr of PRODUCTS) {
    await db.product.create({ data: pr })
  }
  console.log(`  ✅ ${PRODUCTS.length} products`)

  await db.appVersion.create({
    data: {
      versionCode: 2,
      versionName: '1.0.1',
      apkUrl: 'https://github.com/ahemadjuneja-stack/qalb/releases/download/v1.0.1-27/qalb-v1.0.1.apk',
      releaseNotes:
        '• Audio-only mode ki battery optimization behtar hui\n• Naye sufi qawwali playlist add hue\n• Prayer times ki location accuracy fix\n• Ramadan calendar theme',
    },
  })
  console.log('  ✅ app version 1.0.1 (code 2)')

  console.log('🌿 Seed complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
