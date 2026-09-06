import test from 'node:test';
import assert from 'node:assert/strict';
import { canPatchRound, viewForPhase } from '../src/services/live-ui.js';
import { cleanSuggestionsForQuery } from '../src/services/live-suggestions.js';
import { findAnswerMatch } from '../src/core.js';
import { sessionStore } from '../src/services/storage.js';

test('incoming answer and score updates do not replace another player’s active form', () => {
  for(const phase of ['answering','scoring']) {
    const before={gameId:'g',currentRound:1,phase,players:{a:{},b:{}},rounds:{1:{answers:{},scoreClaims:{}}}};
    const after=structuredClone(before);
    if(phase==='answering') after.rounds[1].answers.b={text:'pads',locked:true};
    else after.rounds[1].scoreClaims.b={points:7};
    assert.equal(canPatchRound(before,after,'play','a'),true);
    assert.equal(canPatchRound(before,after,'play','b'),false);
  }
});
test('recap viewers automatically follow the host into the next round and finale', () => {
  assert.equal(viewForPhase('recap','answering'),'play');
  assert.equal(viewForPhase('recap','finished'),'finale');
});
test('a zero-point draft and its selected reference survive a score refresh', () => {
  const values=new Map();
  globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  sessionStore.saveScoreDraft('g',1,'a',{points:0,selectedAnswerIndex:null});
  assert.deepEqual(sessionStore.readScoreDraft('g',1,'a'),{points:0,selectedAnswerIndex:null});
  assert.equal(sessionStore.readScoreDraft('g',2,'a'),null);
  assert.equal(sessionStore.readScoreDraft('g',1,'b'),null);
  sessionStore.clearScoreDraft('g',1,'a');
  assert.equal(sessionStore.readScoreDraft('g',1,'a'),null);
});
test('near-identical plural suggestions collapse without merging different meanings', () => {
  const result=cleanSuggestionsForQuery('how to make',['how to make a cake','how to make a cake!','how to make a cakes','how to make cake pops','how to make cake pop','how to make cake frosting','other how to make cakes']);
  assert.deepEqual(result,['how to make a cake','how to make cake pops','how to make cake frosting']);
  assert.equal(findAnswerMatch('elbow','pad',['elbow pads']).matched,true);
  assert.deepEqual(cleanSuggestionsForQuery('best',['best glass','best gas','best class']),['best glass','best gas','best class']);
});
