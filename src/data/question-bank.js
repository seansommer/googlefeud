// These are built-in snapshots for demo/fallback play. They are not represented
// as current Google results. A configured live provider replaces the answer list
// immediately before the host opens a round.
export const QUESTION_BANK = [
  {
    id: "how-to",
    category: "How To",
    prompt: "How to ____",
    query: "how to ",
    answers: [
      "how to screenshot on mac",
      "how to tie a tie",
      "how to delete instagram account",
      "how to make french toast",
      "how to lower blood pressure",
      "how to solve a rubik's cube",
      "how to write a check"
    ]
  },
  {
    id: "why-is-my",
    category: "Life's Mysteries",
    prompt: "Why is my ____",
    query: "why is my ",
    answers: [
      "why is my phone not charging",
      "why is my eye twitching",
      "why is my internet so slow",
      "why is my cat meowing so much",
      "why is my dog shaking",
      "why is my car overheating",
      "why is my laptop so slow"
    ]
  },
  {
    id: "can-you-freeze",
    category: "Kitchen Questions",
    prompt: "Can you freeze ____",
    query: "can you freeze ",
    answers: [
      "can you freeze eggs",
      "can you freeze cheese",
      "can you freeze milk",
      "can you freeze avocados",
      "can you freeze cooked rice",
      "can you freeze cream cheese",
      "can you freeze bananas"
    ]
  },
  {
    id: "best-way-to",
    category: "Best Way",
    prompt: "Best way to ____",
    query: "best way to ",
    answers: [
      "best way to lose weight",
      "best way to cook bacon",
      "best way to learn spanish",
      "best way to clean an oven",
      "best way to save money",
      "best way to hard boil eggs",
      "best way to remove wallpaper"
    ]
  },
  {
    id: "is-it-safe-to",
    category: "Should I?",
    prompt: "Is it safe to ____",
    query: "is it safe to ",
    answers: [
      "is it safe to eat raw cookie dough",
      "is it safe to travel alone",
      "is it safe to microwave plastic",
      "is it safe to sleep with a fan on",
      "is it safe to eat snow",
      "is it safe to reheat rice",
      "is it safe to drink rainwater"
    ]
  },
  {
    id: "what-happens-if",
    category: "What Happens",
    prompt: "What happens if ____",
    query: "what happens if ",
    answers: [
      "what happens if you don't sleep",
      "what happens if you swallow gum",
      "what happens if you eat mold",
      "what happens if you miss jury duty",
      "what happens if you drink too much water",
      "what happens if you stop paying taxes",
      "what happens if you delete icloud backup"
    ]
  },
  {
    id: "why-do-dogs",
    category: "Animals",
    prompt: "Why do dogs ____",
    query: "why do dogs ",
    answers: [
      "why do dogs eat grass",
      "why do dogs lick you",
      "why do dogs shake",
      "why do dogs howl",
      "why do dogs sleep so much",
      "why do dogs have whiskers",
      "why do dogs chase their tails"
    ]
  },
  {
    id: "people-who-always",
    category: "People",
    prompt: "People who always ____",
    query: "people who always ",
    answers: [
      "people who always complain",
      "people who always need attention",
      "people who always blame others",
      "people who always interrupt",
      "people who always talk about themselves",
      "people who always say sorry",
      "people who always cancel plans"
    ]
  },
  {
    id: "do-i-need-a",
    category: "Do I Need It?",
    prompt: "Do I need a ____",
    query: "do i need a ",
    answers: [
      "do i need a passport to go to canada",
      "do i need a lawyer",
      "do i need a permit to build a shed",
      "do i need a box spring",
      "do i need a visa",
      "do i need a real id to fly",
      "do i need a will"
    ]
  },
  {
    id: "things-to-do-when",
    category: "Boredom",
    prompt: "Things to do when ____",
    query: "things to do when ",
    answers: [
      "things to do when bored",
      "things to do when it rains",
      "things to do when you can't sleep",
      "things to do when sick",
      "things to do when stressed",
      "things to do when home alone",
      "things to do when retired"
    ]
  },
  {
    id: "should-i-buy",
    category: "Shopping",
    prompt: "Should I buy ____",
    query: "should i buy ",
    answers: [
      "should i buy a house",
      "should i buy a new car",
      "should i buy or rent",
      "should i buy an electric car",
      "should i buy travel insurance",
      "should i buy a refurbished phone",
      "should i buy gold"
    ]
  },
  {
    id: "why-cant-i",
    category: "Why Can't I?",
    prompt: "Why can't I ____",
    query: "why can't i ",
    answers: [
      "why can't i sleep",
      "why can't i lose weight",
      "why can't i cry",
      "why can't i focus",
      "why can't i remember anything",
      "why can't i stop coughing",
      "why can't i download apps"
    ]
  }
];

export function buildQuestionQueue(totalRounds) {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  const queue = [];
  for (let index = 0; index < totalRounds; index += 1) {
    queue.push({ ...shuffled[index % shuffled.length], order: index + 1 });
  }
  return queue;
}
