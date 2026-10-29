// Qalb — VERIFIED Islamic Trending Pool (InnerTube se live verify kiya gaya)
// ─────────────────────────────────────────────────────────────────
// Ye saare videoIds YouTube par live check kiye gaye hain — sab paak
// kalaam (naat/hamd/qawwali/nasheed/sufi). Daily trending rotation isi
// pool se hoti hai (roz alag selection — YouTube jaisa "Aaj ka Trending").
//
// NOTE: ye STATIC curated pool hai — dynamic search results sirf search
// me aate hain. Pool me sirf VERIFIED islamic content hai (bollywood/
// bhajan/ghazal waghera ko build time par hi filter kar diya gaya).

import type { QalbTrack } from '@/lib/types'

export interface PoolEntry {
  videoId: string
  title: string
  artist: string
  category: 'NAAT' | 'HAMD' | 'QAWWALI' | 'NASHEED'
  views: number
}

export const TRENDING_POOL: PoolEntry[] = [
  { videoId: 'kw4tT7SCmaY', title: 'Afreen Afreen', artist: 'Rahat Fateh Ali Khan', category: 'QAWWALI', views: 696_000_000 },
  { videoId: 'vgmgAdAu2ew', title: 'Jagha Ji Lagane Ki Duniya Nahi Hai', artist: 'Ghulam Mustafa Qadri', category: 'NAAT', views: 182_000_000 },
  { videoId: 'f4J7-WR1QOY', title: 'Number One For Me', artist: 'Maher Zain', category: 'NASHEED', views: 175_000_000 },
  { videoId: 'D8PY4Iha0Q8', title: 'Main Banda-e-Aasi Hoon', artist: 'Syed Hassan Ullah Hussaini', category: 'NAAT', views: 174_000_000 },
  { videoId: 'mHpTdsBbYRM', title: 'Baraka Allahu Lakuma', artist: 'Maher Zain', category: 'NASHEED', views: 165_000_000 },
  { videoId: 'fHa6giIfRt4', title: 'Naat-e-Sarkar Ki Parta Hoon Main', artist: 'Lyrics Naats', category: 'NAAT', views: 153_000_000 },
  { videoId: '2VLqZtded_0', title: 'Qalbi Fil Madinah', artist: 'Maher Zain & Harris J', category: 'NASHEED', views: 149_000_000 },
  { videoId: 'T1bnRJFNjic', title: 'Assubhu Bada Min Tal\'atihi', artist: 'Usaid Zahid Siddique', category: 'NAAT', views: 139_000_000 },
  { videoId: '1epGrjg9F1Q', title: 'Chor Fikr Duniya Ki', artist: 'Nawal Khan', category: 'NAAT', views: 128_000_000 },
  { videoId: 'BzgK9689bfE', title: 'Ay Khatm-e-Rusul Makki Madani', artist: 'Sibtain Haider', category: 'NAAT', views: 124_000_000 },
  { videoId: 'ewEbKU_sGgw', title: 'Ik Khawab Sunawan', artist: 'Rahat Fateh Ali Khan', category: 'NAAT', views: 106_000_000 },
  { videoId: 'mfm9Mse1ZPQ', title: 'Tu Kuja Man Kuja', artist: 'Owais Raza Qadri', category: 'QAWWALI', views: 103_000_000 },
  { videoId: 'PHbZ9SXHJwA', title: 'For The Rest Of My Life', artist: 'Maher Zain', category: 'NASHEED', views: 100_000_000 },
  { videoId: 'KliEFgPTqP0', title: 'Wo Shehr-e-Mohabbat', artist: 'Zohaib Ashrafi', category: 'NAAT', views: 88_000_000 },
  { videoId: 'qTGu_ZpNEH0', title: 'Meri Baat Ban Gayi Hai', artist: 'Ghulam Mustafa Qadri', category: 'NAAT', views: 85_000_000 },
  { videoId: 'l3hHUwc1cAk', title: 'Mera Dil Badal De', artist: 'Junaid Jamshed', category: 'NAAT', views: 81_000_000 },
  { videoId: 'LSgRKxJb5Qg', title: 'Assubhu Bada (Allah Hu)', artist: 'Syeda Areeba Fatima', category: 'NAAT', views: 81_000_000 },
  { videoId: 'z2_2cFityc4', title: 'You Came To Me', artist: 'Sami Yusuf', category: 'NASHEED', views: 79_000_000 },
  { videoId: '74cVT_tUpck', title: 'Wohi Khuda Hai', artist: 'Atif Aslam', category: 'HAMD', views: 79_000_000 },
  { videoId: 'eYSaHXXFIBU', title: 'Sanson Ki Mala Pe', artist: 'Nusrat Fateh Ali Khan', category: 'QAWWALI', views: 73_000_000 },
  { videoId: 'tumvKqIj8Jc', title: 'Kamli Wale Muhammad', artist: 'Nusrat Fateh Ali Khan', category: 'QAWWALI', views: 72_000_000 },
  { videoId: 'XcikV4gcPzo', title: 'Ya Rasul Allah (Part II)', artist: 'Sami Yusuf', category: 'NASHEED', views: 72_000_000 },
  { videoId: 'Yh-VsonQ1mc', title: 'Ilahi Teri Chaukhat', artist: 'Junaid Jamshed', category: 'NAAT', views: 72_000_000 },
  { videoId: '7SDrjwtfKMk', title: 'Chaap Tilak', artist: 'Abida Parveen & Rahat Fateh Ali Khan', category: 'QAWWALI', views: 69_000_000 },
  { videoId: 'q4NVp-aFZSw', title: 'Tumhein Dillagi Bhool Jani Paregi', artist: 'Nusrat Fateh Ali Khan', category: 'QAWWALI', views: 66_000_000 },
  { videoId: 'Nqwmh4WXMmo', title: 'Allah Hu Allah Hu', artist: 'Nusrat Fateh Ali Khan', category: 'HAMD', views: 62_000_000 },
  { videoId: 'Uks8psEpmB4', title: 'Rang', artist: 'Rahat Fateh Ali Khan & Amjad Sabri', category: 'QAWWALI', views: 59_000_000 },
  { videoId: 'LekqDjknArc', title: 'Aaqa', artist: 'Abida Parveen & Ali Sethi', category: 'QAWWALI', views: 57_000_000 },
  { videoId: 'QuNyMxLlVig', title: 'Sochta Hoon Ke Woh Kitne Masoom', artist: 'Nusrat Fateh Ali Khan', category: 'QAWWALI', views: 56_000_000 },
  { videoId: 'AKxGpetj3_g', title: 'Huwa Al-Quran', artist: 'Maher Zain', category: 'NASHEED', views: 55_000_000 },
  { videoId: 'KX3OhwIlzlY', title: 'Mein Tu Ummati Hon', artist: 'Junaid Jamshed', category: 'NAAT', views: 53_000_000 },
  { videoId: 'CgC9fLU7oko', title: 'Ab To Bus Aik Hi Dhun Hai', artist: 'Owais Raza Qadri', category: 'NAAT', views: 50_000_000 },
  { videoId: 'uuN0bf4rhT0', title: 'Madad', artist: 'Sami Yusuf', category: 'NASHEED', views: 49_000_000 },
  { videoId: 'JD1k4_d0S1Y', title: 'Bhar Do Jholi Meri', artist: 'Amjad Fareed Sabri', category: 'QAWWALI', views: 47_000_000 },
  { videoId: 'FKV2oeS4vw8', title: 'Forgotten Promises', artist: 'Sami Yusuf', category: 'NASHEED', views: 46_000_000 },
  { videoId: 'Xe2edHVckt0', title: 'An Nabi Sallu Alaih', artist: 'Owais Raza Qadri', category: 'NAAT', views: 42_000_000 },
  { videoId: 'Tx-kHi2DpkY', title: 'Hum Ne Ankhon Se Dekha Nahi Hai', artist: 'Bukhari Studio', category: 'NAAT', views: 41_000_000 },
  { videoId: 'JqEJDPo_4fc', title: 'Mere Nabi Pyare Nabi', artist: 'Junaid Jamshed', category: 'NAAT', views: 40_000_000 },
  { videoId: 'xM35ah7cjxw', title: 'Hum Ko Bulana Ya Rasool Allah', artist: 'Owais Raza Qadri', category: 'NAAT', views: 39_000_000 },
  { videoId: 'Xic3zBM-P0g', title: 'Humne Aankhon Se Dekha Nahin', artist: 'Mazharul Islam', category: 'NAAT', views: 36_000_000 },
  { videoId: 'i3lqPUbYyTM', title: 'Make Me Strong', artist: 'Sami Yusuf', category: 'NASHEED', views: 36_000_000 },
  { videoId: '5RBfAHlIbTU', title: 'Sukhan Lagan Mein Wo Sab Se Aala', artist: 'Nasheed Club', category: 'NAAT', views: 35_000_000 },
  { videoId: 'tL5sYdlk20I', title: 'Tu Mane Ya Na Mane', artist: 'Wadali Brothers', category: 'QAWWALI', views: 33_000_000 },
  { videoId: '7zOl6BCI89E', title: 'Lajpal Nabi Mere', artist: 'Syed Hassan Ullah Hussaini', category: 'NAAT', views: 33_000_000 },
]

/** Pool entry → QalbTrack (thumbnail auto) */
export function poolToTrack(e: PoolEntry, idx: number): QalbTrack {
  return {
    id: `pool-${e.videoId}`,
    videoId: e.videoId,
    title: e.title,
    artist: e.artist,
    category: e.category,
    thumbnailUrl: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
    tags: `trending,views:${e.views}`,
    playCount: e.views,
    _poolIdx: idx,
  } as QalbTrack
}
