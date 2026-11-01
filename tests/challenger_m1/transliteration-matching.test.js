'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreImportedCandidate } = require('../../src/server/server.js');

test('Non-Latin transliteration: Cyrillic artist and title matching', () => {
  // Russian / Cyrillic artist matching Latin transliteration
  const target1 = {
    title: 'Gruppa Krovi',
    artist: 'Kino',
    duration: 285
  };
  const candCyrillic = {
    title: 'Группа крови',
    artist: 'Кино - Topic',
    duration: 285
  };
  const score1 = scoreImportedCandidate(target1.title, target1.artist, target1.duration, candCyrillic);
  assert.ok(score1 >= 100, `Kino (Кино) should match and score >= 100, got ${score1}`);

  // Viktor Tsoy
  const target2 = {
    title: 'Kukushka',
    artist: 'Viktor Tsoy',
    duration: 399
  };
  const cand2 = {
    title: 'Кукушка',
    artist: 'Виктор Цой',
    duration: 399
  };
  const score2 = scoreImportedCandidate(target2.title, target2.artist, target2.duration, cand2);
  assert.ok(score2 >= 80, `Viktor Tsoy (Виктор Цой) should match and score >= 80, got ${score2}`);

  // Cyrillic target vs Cyrillic candidate
  const targetCyr = {
    title: 'Спокойная ночь',
    artist: 'Кино',
    duration: 367
  };
  const candCyr = {
    title: 'Кино - Спокойная ночь (Official Audio)',
    artist: 'Кино',
    duration: 367
  };
  const scoreCyr = scoreImportedCandidate(targetCyr.title, targetCyr.artist, targetCyr.duration, candCyr);
  assert.ok(scoreCyr >= 100, `Cyrillic to Cyrillic should score high, got ${scoreCyr}`);
});

test('Non-Latin transliteration: Greek artist and title matching', () => {
  const target = {
    title: 'Eleni',
    artist: 'Eleni Foureira',
    duration: 180
  };
  const candidate = {
    title: 'Ελένη',
    artist: 'Ελένη Φουρέιρα - Topic',
    duration: 180
  };
  const score = scoreImportedCandidate(target.title, target.artist, target.duration, candidate);
  assert.ok(score >= 100, `Greek artist Ελένη Φουρέιρα should match Eleni Foureira with score >= 100, got ${score}`);

  // Theodorakis
  const target2 = {
    title: 'Zorba',
    artist: 'Mikis Theodorakis',
    duration: 240
  };
  const candidate2 = {
    title: 'Ζορμπάς',
    artist: 'Μίκης Θεοδωράκης',
    duration: 240
  };
  const score2 = scoreImportedCandidate(target2.title, target2.artist, target2.duration, candidate2);
  assert.ok(score2 >= 80, `Mikis Theodorakis (Μίκης Θεοδωράκης) should match with score >= 80, got ${score2}`);
});

test('Arabic & Persian diacritics, tatweel, and letter variant normalization', () => {
  // Amr Diab with diacritics vs plain
  const target = {
    title: 'Tamally Maak',
    artist: 'عَمْرُو دِيَابْ', // with harakat/diacritics
    duration: 269
  };
  const candidate = {
    title: 'تملي معاك',
    artist: 'عمرو دياب - Topic', // plain Arabic without diacritics
    duration: 269
  };
  const score = scoreImportedCandidate(target.title, target.artist, target.duration, candidate);
  assert.ok(score >= 80, `Arabic diacritics should match plain Arabic, got ${score}`);

  // Persian variants (kaf / yeh / alef variants / tatweel)
  const targetPersian = {
    title: 'Song',
    artist: 'كـاروان', // with tatweel and standard kaf
    duration: 200
  };
  const candidatePersian = {
    title: 'Song',
    artist: 'کاروان', // Persian kaf without tatweel
    duration: 200
  };
  const scoreP = scoreImportedCandidate(targetPersian.title, targetPersian.artist, targetPersian.duration, candidatePersian);
  assert.ok(scoreP >= 100, `Persian/Arabic variants should match with score >= 100, got ${scoreP}`);

  // Alef with hamza vs plain alef
  const targetAlef = {
    title: 'Betmoun',
    artist: 'إليسا', // with hamza below
    duration: 240
  };
  const candAlef = {
    title: 'Betmoun',
    artist: 'اليسا', // plain alef
    duration: 240
  };
  const scoreA = scoreImportedCandidate(targetAlef.title, targetAlef.artist, targetAlef.duration, candAlef);
  assert.ok(scoreA >= 100, `Alef with hamza should match plain alef, got ${scoreA}`);
});

test('Latin ligatures, Nordic, and European accented characters matching', () => {
  // Danish/Norwegian MØ
  const targetMo = {
    title: 'Lean On',
    artist: 'Major Lazer, DJ Snake, MØ',
    duration: 176
  };
  const candMo = {
    title: 'Major Lazer & DJ Snake - Lean On (feat. MO)',
    artist: 'Major Lazer - Topic',
    duration: 176
  };
  const scoreMo = scoreImportedCandidate(targetMo.title, targetMo.artist, targetMo.duration, candMo);
  assert.ok(scoreMo >= 100, `MØ should match MO with score >= 100, got ${scoreMo}`);

  // German eszett (ß -> ss)
  const targetDe = {
    title: 'Grosse Freiheit',
    artist: 'Unheilig',
    duration: 230
  };
  const candDe = {
    title: 'Große Freiheit',
    artist: 'Unheilig - Topic',
    duration: 230
  };
  const scoreDe = scoreImportedCandidate(targetDe.title, targetDe.artist, targetDe.duration, candDe);
  assert.ok(scoreDe >= 120, `Große should match Grosse with score >= 120, got ${scoreDe}`);

  // Icelandic/Nordic Björk and Sigur Rós
  const targetBjork = {
    title: 'Army of Me',
    artist: 'Bjork',
    duration: 234
  };
  const candBjork = {
    title: 'Army of Me',
    artist: 'Björk - Topic',
    duration: 234
  };
  const scoreBjork = scoreImportedCandidate(targetBjork.title, targetBjork.artist, targetBjork.duration, candBjork);
  assert.ok(scoreBjork >= 120, `Björk should match Bjork, got ${scoreBjork}`);

  // French ligatures (œ -> oe)
  const targetOe = {
    title: 'Coeur',
    artist: 'Clara Luciani',
    duration: 200
  };
  const candOe = {
    title: 'Cœur',
    artist: 'Clara Luciani - Topic',
    duration: 200
  };
  const scoreOe = scoreImportedCandidate(targetOe.title, targetOe.artist, targetOe.duration, candOe);
  assert.ok(scoreOe >= 120, `Cœur should match Coeur, got ${scoreOe}`);

  // Polish crossed L (ł -> l)
  const targetPl = {
    title: 'Malo Miasteczkowy',
    artist: 'Dawid Podsiadlo',
    duration: 204
  };
  const candPl = {
    title: 'Małomiasteczkowy',
    artist: 'Dawid Podsiadło - Topic',
    duration: 204
  };
  const scorePl = scoreImportedCandidate(targetPl.title, targetPl.artist, targetPl.duration, candPl);
  assert.ok(scorePl >= 100, `Dawid Podsiadło (ł) should match Dawid Podsiadlo, got ${scorePl}`);
});

test('Transliteration edge cases: boundary conditions, empty inputs, non-matches', () => {
  // Empty or null inputs should not crash or throw
  assert.strictEqual(scoreImportedCandidate(null, null, null, null), -999);
  assert.strictEqual(scoreImportedCandidate('', '', 0, {}), -999);
  assert.strictEqual(scoreImportedCandidate('Title', 'Artist', 100, { title: '' }), -999);

  // Different artist should not match and should receive penalty
  const target = {
    title: 'Yesterday',
    artist: 'The Beatles',
    duration: 125
  };
  const candWrongArtist = {
    title: 'Yesterday',
    artist: 'Kino - Topic', // Completely different artist
    duration: 125
  };
  const wrongScore = scoreImportedCandidate(target.title, target.artist, target.duration, candWrongArtist);
  // Title matches (65) + topic (35) + dur (35) = 135, but artist penalty (-75) => 60
  // Compare to correct artist match:
  const candCorrectArtist = {
    title: 'Yesterday',
    artist: 'The Beatles - Topic',
    duration: 125
  };
  const correctScore = scoreImportedCandidate(target.title, target.artist, target.duration, candCorrectArtist);
  assert.ok(correctScore > wrongScore + 100, `Correct artist (${correctScore}) must beat wrong artist (${wrongScore}) by >100 pts`);
});
