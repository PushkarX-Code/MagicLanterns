import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editDistance, fold, matchScore, sameLanguage } from './text.ts'

test('text folds accents, case and punctuation', () => {
  assert.equal(fold('Shōgun'), 'shogun')
  assert.equal(fold('Spider-Man: Across the Spider-Verse'), 'spider man across the spider verse')
  assert.equal(fold("Ocean's Eleven"), 'oceans eleven')
  assert.equal(editDistance('interstelar', 'interstellar'), 1)
  assert.equal(editDistance('teh', 'the'), 1, 'a swap of neighbours is one edit')
  assert.ok(editDistance('dune', 'arrival') > 2)
  assert.ok(sameLanguage('eng', 'English') && sameLanguage('fre', 'fra') && !sameLanguage('en', 'es'))
})

test('search forgives typos, run-together words and accents, and ranks titles first', () => {
  const titles = { spider: ['Spider-Man: Across the Spider-Verse'], shogun: ['Shōgun'], inter: ['Interstellar'], dune: ['Dune: Part Two', '', 'Timothée Chalamet Zendaya'] }
  for (const [q, f] of [['spiderman', titles.spider], ['spider verse', titles.spider], ['shogun', titles.shogun], ['intersteller', titles.inter], ['interstel', titles.inter], ['dune part 2', titles.dune], ['timothee', titles.dune], ['zendya', titles.dune]] as const)
    assert.ok(matchScore(q, [...f]) > 0, `"${q}" should find ${f[0]}`)
  assert.equal(matchScore('arrival', titles.inter), 0)
  assert.equal(matchScore('dune batman', titles.dune), 0, 'every typed word has to fit')
  assert.ok(matchScore('dune', ['Dune: Part Two']) > matchScore('dune', ['Arrival', '', 'Dune Fan']), 'a title beats a person')
  assert.ok(matchScore('dune', ['Dune']) > matchScore('dune', ['Dune: Part Two']), 'an exact title beats a longer one')
})
