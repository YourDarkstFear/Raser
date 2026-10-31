const test = require('node:test');
const assert = require('node:assert');
const { scoreImportedCandidate } = require('../src/server/server.js');

test('imported track matching: correctly scores and prioritizes official studio recordings', () => {
  const target = {
    title: 'Levitating',
    artist: 'Dua Lipa',
    duration: 204
  };

  const officialStudioAudio = {
    title: 'Levitating',
    artist: 'Dua Lipa - Topic',
    duration: 204
  };

  const musicVideoWithIntro = {
    title: 'Dua Lipa - Levitating (Official Music Video)',
    artist: 'Dua Lipa',
    duration: 236 // 32 seconds longer due to intro
  };

  const coverVersion = {
    title: 'Levitating - Dua Lipa (Acoustic Cover)',
    artist: 'Forte A cappella',
    duration: 182
  };

  const studioScore = scoreImportedCandidate(target.title, target.artist, target.duration, officialStudioAudio);
  const videoScore = scoreImportedCandidate(target.title, target.artist, target.duration, musicVideoWithIntro);
  const coverScore = scoreImportedCandidate(target.title, target.artist, target.duration, coverVersion);

  // Studio audio should win decisively over video with intro
  assert.ok(studioScore > videoScore, `Studio score (${studioScore}) should be higher than video score (${videoScore})`);
  assert.ok(studioScore >= 120, 'Studio audio score should be high');
  // Video with intro should still be playable (score >= 60) if it is the only version available
  assert.ok(videoScore >= 60, 'Video with realistic intro should not be rejected');
  // Cover should be rejected (negative or below 0)
  assert.ok(coverScore < 0, `Cover version should be rejected (was ${coverScore})`);
});

test('imported track matching: deep artist matching supports collaborating and featured artists', () => {
  const target = {
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    duration: 230
  };

  const candidateWithFeat = {
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    duration: 230
  };

  const candidateBothInArtist = {
    title: 'Starboy',
    artist: 'The Weeknd & Daft Punk',
    duration: 230
  };

  const wrongCoverArtist = {
    title: 'Starboy - The Weeknd Cover',
    artist: 'Random Singer',
    duration: 230
  };

  const featScore = scoreImportedCandidate(target.title, target.artist, target.duration, candidateWithFeat);
  const bothScore = scoreImportedCandidate(target.title, target.artist, target.duration, candidateBothInArtist);
  const wrongScore = scoreImportedCandidate(target.title, target.artist, target.duration, wrongCoverArtist);

  assert.ok(featScore >= 100, `Featured candidate should score high: ${featScore}`);
  assert.ok(bothScore >= 100, `Collaborating candidate should score high: ${bothScore}`);
  assert.ok(wrongScore < 0, `Wrong cover artist should be rejected: ${wrongScore}`);
});

test('imported track matching: cleans remaster noise and title badges', () => {
  const target = {
    title: 'Starboy - Remastered 2021',
    artist: 'The Weeknd',
    duration: 230
  };

  const candidate = {
    title: 'The Weeknd - Starboy (Official Audio)',
    artist: 'The Weeknd - Topic',
    duration: 230
  };

  const score = scoreImportedCandidate(target.title, target.artist, target.duration, candidate);
  assert.ok(score >= 120, `Cleaned remaster match should score high: ${score}`);
});
