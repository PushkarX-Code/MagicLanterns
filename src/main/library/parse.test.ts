import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVideo, titleKey } from './parse.ts'

const R = '/lib'
const p = (rel: string) => parseVideo(`${R}/${rel}`, R)
const movie = (rel: string, title: string, year: number | null) => {
  const r = p(rel)
  assert.deepEqual([r.kind, r.title, r.year], ['movie', title, year], rel)
}
const episode = (rel: string, title: string, season: number, episodes: number[]) => {
  const r = p(rel)
  assert.deepEqual([r.kind, r.title, r.season, r.episodes], ['episode', title, season, episodes], rel)
}

test('films from scene-style names', () => {
  movie('Dune.Part.Two.2024.2160p.UHD.BluRay.x265.10bit.HDR.DTS-HD.MA.7.1-GROUP.mkv', 'Dune Part Two', 2024)
  movie('Blade.Runner.2049.2017.1080p.BluRay.x264.mkv', 'Blade Runner 2049', 2017)
  movie('Mad Max Fury Road (2015) [1080p] [BluRay] [5.1] [YTS.MX].mp4', 'Mad Max Fury Road', 2015)
  movie('Inception_2010_720p.mkv', 'Inception', 2010)
  movie('The Dark Knight 2008 IMAX 2160p.mkv', 'The Dark Knight', 2008)
  movie('Spider-Man.Across.the.Spider-Verse.2023.WEB-DL.mkv', 'Spider-Man Across the Spider-Verse', 2023)
  movie('La La Land.mkv', 'La La Land', null)
  movie('Interstellar.REMUX.mkv', 'Interstellar', null)
})

test('titles that contain years or look like years', () => {
  movie('2001.A.Space.Odyssey.1968.1080p.mkv', '2001 A Space Odyssey', 1968)
  movie('1917.2019.2160p.mkv', '1917', 2019)
  movie('Blade Runner 2049.mkv', 'Blade Runner', 2049)
})

test('a well-named folder beats a poor file name', () => {
  movie('Arrival (2016)/movie.mkv', 'Arrival', 2016)
  movie('Arrival (2016)/arrival-1080p.mkv', 'Arrival', 2016)
  movie('Top Gun Maverick (2022)/Top.Gun.Maverick.2022.mkv', 'Top Gun Maverick', 2022)
})

test('episodes with SxxEyy', () => {
  episode('Severance/Season 2/Severance.S02E03.1080p.WEB.mkv', 'Severance', 2, [3])
  episode('The.Bear.S01E01.System.720p.mkv', 'The Bear', 1, [1])
  episode('Shows/Arcane - s01e09 - The Monster You Created.mkv', 'Arcane', 1, [9])
  episode('Severance.S02E03E04.mkv', 'Severance', 2, [3, 4])
  episode('Severance.S01E01-E03.mkv', 'Severance', 1, [1, 2, 3])
  episode('Doctor.Who.2005.S01E01.mkv', 'Doctor Who', 1, [1])
  episode('Shogun 1x03 Tomorrow is Tomorrow.mkv', 'Shogun', 1, [3])
})

test('episodes named only by their folders', () => {
  episode('Shogun (2024)/Season 1/03 - Tomorrow is Tomorrow.mkv', 'Shogun', 1, [3])
  episode('Arcane/Season 02/Episode 5.mkv', 'Arcane', 2, [5])
  episode('Severance/S01/S01E02.mkv', 'Severance', 1, [2])
  episode('Attack on Titan/Specials/01.mkv', 'Attack on Titan', 0, [1])
})

test('anime release names', () => {
  episode('[SubsPlease] Jujutsu Kaisen - 05 (1080p) [A1B2C3D4].mkv', 'Jujutsu Kaisen', 1, [5])
  episode('[Erai-raws] Spy x Family - 12v2 [1080p].mkv', 'Spy x Family', 1, [12])
  episode('Naruto Shippuden - 471.mkv', 'Naruto Shippuden', 1, [471])
  episode('Anime/Attack on Titan/Season 1/[Group] Attack on Titan - 01 [BD 1080p].mkv', 'Attack on Titan', 1, [1])
})

test('samples, trailers and bonus features are marked as extras', () => {
  assert.equal(p('Dune (2021)/Dune.2021.sample.mkv').extra, true)
  assert.equal(p('Dune (2021)/Extras/Making the Sandworm.mkv').extra, true)
  assert.equal(p('Arrival (2016)/Featurettes/Language.mkv').extra, true)
  assert.equal(p('Arrival (2016)/Arrival-trailer.mp4').extra, true)
  assert.equal(p('Dune (2021)/Dune.2021.mkv').extra, false)
})

test('title keys ignore case, accents and punctuation', () => {
  assert.equal(titleKey('Spider-Man: Across the Spider-Verse'), titleKey('spider man across the spider verse'))
  assert.equal(titleKey('Shōgun'), titleKey('Shogun'))
  assert.equal(titleKey('Fast & Furious'), 'fast and furious')
})
