// Quick sanity test for naye permissive search rules
import { ruleBasedValidate } from '../src/lib/search-rules'

const tests: Array<[string, boolean]> = [
  ['Zain Zohaib', true],                    // artist name — ALLOW (user ka case)
  ['zain zohaib naat', true],
  ['tajdar e haram', true],
  ['Tajdar-e-Haram', true],
  ['sufi qawwali', true],                   // sufi — block NAHI hoga
  ['ishq sufi kalam', true],
  ['pyare nabi', true],                     // "pyar" substring false-positive nahi
  ['jannat ke phool naat', true],
  ['madina madina', true],
  ['owais raza qadri', true],
  ['bollywood songs', false],               // film music — BLOCK
  ['shahrukh khan song', false],
  ['new movie song', false],
  ['romantic love song', false],
  ['remix dj dance party', false],
]

let pass = 0
for (const [q, expectValid] of tests) {
  const r = ruleBasedValidate(q)
  const ok = r.valid === expectValid
  if (ok) pass++
  console.log(
    (ok ? 'PASS' : 'FAIL'),
    '|', q.padEnd(26), '→', r.valid ? 'ALLOW' : 'BLOCK',
    '| refined:', r.refinedQuery
  )
}
console.log(`\n${pass}/${tests.length} tests passed`)
if (pass !== tests.length) process.exit(1)
