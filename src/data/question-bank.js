// Five hundred prompt starters for live autocomplete rounds. These are only
// unfinished queries; answer boards are requested immediately before a round.
const PROMPT_GROUPS = [
  {
    category: "How To",
    queries: [
      "how to", "how to make", "how to fix", "how to clean", "how to cook",
      "how to learn", "how to draw", "how to write", "how to build", "how to grow",
      "how to stop", "how to start", "how to find", "how to choose", "how to remove",
      "how to remember", "how to tell if", "how to get rid of", "how to use", "how to become",
      "how to prepare for", "how to ask", "how to know when", "how to keep", "how to make someone"
    ]
  },
  {
    category: "Why Does My…",
    queries: [
      "why does my phone", "why does my computer", "why does my car", "why does my dog", "why does my cat",
      "why does my eye", "why does my stomach", "why does my house", "why does my internet", "why does my hair",
      "why does my skin", "why does my baby", "why does my room", "why does my plant", "why does my refrigerator",
      "why does my washing machine", "why does my television", "why does my alarm", "why does my battery", "why does my voice",
      "why does my back", "why does my knee", "why does my coffee", "why does my bread", "why does my neighbor"
    ]
  },
  {
    category: "Why Do People…",
    queries: [
      "why do people", "why do people lie", "why do people dream", "why do people snore", "why do people blush",
      "why do people yawn", "why do people laugh", "why do people cry", "why do people gossip", "why do people procrastinate",
      "why do people talk in their sleep", "why do people bite their nails", "why do people love", "why do people hate", "why do people ghost",
      "why do people collect", "why do people travel", "why do people get married", "why do people celebrate", "why do people shake hands",
      "why do people say", "why do people believe", "why do people remember", "why do people forget", "why do people change"
    ]
  },
  {
    category: "What Happens…",
    queries: [
      "what happens if", "what happens when", "what happens after", "what happens before", "what happens if you don't sleep",
      "what happens if you swallow", "what happens if you eat", "what happens if you drink", "what happens if you stop", "what happens if you mix",
      "what happens when you quit", "what happens when you freeze", "what happens when you boil", "what happens when you retire", "what happens when you sneeze",
      "what happens after you die", "what happens after a storm", "what happens after an interview", "what happens before a wedding", "what happens during a dream",
      "what happens to your body when", "what happens to food when", "what happens to animals when", "what happens to phones when", "what happens at the end of"
    ]
  },
  {
    category: "Can You…",
    queries: [
      "can you", "can you freeze", "can you eat", "can you drink", "can you cook",
      "can you wash", "can you recycle", "can you microwave", "can you bring", "can you take",
      "can you learn", "can you teach", "can you train", "can you grow", "can you plant",
      "can you travel with", "can you fly with", "can you sleep with", "can you live without", "can you survive without",
      "can you see", "can you hear", "can you smell", "can you remember", "can you be allergic to"
    ]
  },
  {
    category: "Is It…",
    queries: [
      "is it", "is it safe to", "is it normal to", "is it bad to", "is it good to",
      "is it okay to", "is it possible to", "is it illegal to", "is it weird to", "is it too late to",
      "is it worth", "is it better to", "is it cheaper to", "is it hard to", "is it easy to",
      "is it true that", "is it rude to", "is it healthy to", "is it dangerous to", "is it smart to",
      "is it time to", "is it supposed to", "is it going to", "is it ever too early to", "is it normal for dogs to"
    ]
  },
  {
    category: "Should I…",
    queries: [
      "should i", "should i buy", "should i sell", "should i tell", "should i ask",
      "should i call", "should i text", "should i quit", "should i move", "should i travel",
      "should i get", "should i keep", "should i throw away", "should i worry about", "should i apologize",
      "should i wait", "should i stay", "should i go", "should i learn", "should i change",
      "should i bring", "should i invite", "should i cook", "should i clean", "should i wake up"
    ]
  },
  {
    category: "Best Way",
    queries: [
      "best way to", "best way to clean", "best way to cook", "best way to learn", "best way to save",
      "best way to remove", "best way to fix", "best way to organize", "best way to remember", "best way to travel",
      "best way to sleep", "best way to wake up", "best way to exercise", "best way to celebrate", "best way to surprise",
      "best way to store", "best way to reheat", "best way to decorate", "best way to meet", "best way to ask",
      "best way to start", "best way to stop", "best way to choose", "best way to pack", "best way to spend"
    ]
  },
  {
    category: "Things To Do",
    queries: [
      "things to do when", "things to do before", "things to do after", "things to do at", "things to do in",
      "things to do with", "things to do without", "things to do on a rainy day", "things to do when bored", "things to do when you can't sleep",
      "things to do on vacation", "things to do at home", "things to do with kids", "things to do with friends", "things to do alone",
      "things to do this weekend", "things to do for free", "things to do outside", "things to do indoors", "things to do at night",
      "things to do on your birthday", "things to do before you die", "things to do before a wedding", "things to do after dinner", "things to do while waiting"
    ]
  },
  {
    category: "Kitchen Table",
    queries: [
      "how long to cook", "how long to bake", "how long to boil", "how long does food last", "what goes with",
      "what can i make with", "what can i substitute for", "why is my cake", "why is my bread", "why is my chicken",
      "can i eat", "can i freeze cooked", "can i make dinner with", "best spice for", "best sauce for",
      "what to serve with", "what to cook for", "easy dinner for", "healthy snack for", "dessert with",
      "foods that taste like", "foods that start with", "foods that are high in", "foods you should never", "the secret to perfect"
    ]
  },
  {
    category: "Animal Kingdom",
    queries: [
      "why do dogs", "why do cats", "why do birds", "why do fish", "why do horses",
      "why do rabbits", "why do squirrels", "why do bears", "why do sharks", "why do dolphins",
      "can dogs eat", "can cats eat", "can birds eat", "animals that can", "animals that live in",
      "animals that start with", "animals that look like", "what do penguins", "what do elephants", "what do owls",
      "how do bees", "how do snakes", "how do turtles", "do animals dream about", "the fastest animal is"
    ]
  },
  {
    category: "Around The House",
    queries: [
      "how often should you clean", "how often should you replace", "how often should you wash", "best color for a", "best place to put",
      "how to organize a", "how to decorate a", "how to fix a leaking", "how to remove stains from", "how to make a room",
      "why is my house", "why is my shower", "why is my toilet", "why is my sink", "why is my air conditioner",
      "what causes a house to", "what to keep in your", "things every home needs", "things you should never flush", "things hiding under",
      "can you paint over", "can you wash a", "when should you replace", "where should i store", "the best smell for a house is"
    ]
  },
  {
    category: "Travel Time",
    queries: [
      "best place to travel for", "best time to visit", "things to pack for", "things not to pack for", "can i bring on a plane",
      "why are flights", "how early should i arrive", "what to do at the airport", "what to do on a long flight", "where can i travel without",
      "cheapest place to fly", "most beautiful place in", "strangest law in", "foods to try in", "things tourists always",
      "is it safe to travel to", "should i visit", "how to survive a road trip", "how to sleep on a plane", "what happens if you miss a flight",
      "best vacation for families", "best vacation for couples", "best vacation for friends", "places that look like", "before traveling you should"
    ]
  },
  {
    category: "Tech Life",
    queries: [
      "why is my phone so", "why is my laptop so", "why is my wifi", "why won't my phone", "why won't my computer",
      "how to take a screenshot on", "how to delete", "how to recover", "how to reset", "how to update",
      "can my phone", "can artificial intelligence", "what does the internet", "what happens when you delete", "best app for",
      "best phone for", "things your phone can do", "things you should never post", "is my phone listening when", "why do websites ask for",
      "how much storage do i need for", "what is the difference between", "will robots ever", "the internet would be better without", "technology that will disappear"
    ]
  },
  {
    category: "Work & Money",
    queries: [
      "best job for someone who", "jobs that pay", "jobs you can do from", "how to ask for a", "how to prepare for an interview",
      "what to wear to", "what not to say at work", "why do coworkers", "should i quit my job if", "how much money should i",
      "best way to save money on", "things worth spending money on", "things people waste money on", "can you retire with", "how to make extra money",
      "what happens if you don't pay", "why is everything so expensive", "best business to start with", "work excuses involving", "things a boss should never",
      "how to look busy when", "how to survive a meeting", "what makes a good leader", "what makes a bad employee", "the future of work is"
    ]
  },
  {
    category: "School & Learning",
    queries: [
      "best way to learn online", "how to remember what you read", "how to study for", "how to write a", "how to solve",
      "why do we learn", "why is math", "why is history", "what happens if you fail", "things teachers always say",
      "things students always forget", "best school lunch", "best excuse for missing homework", "can you learn while sleeping", "how long does it take to learn",
      "what should everyone know about", "books everyone should read", "subjects that should be taught", "things not taught in school", "what makes someone smart",
      "how to make reading", "how to make math", "how to learn a language", "what comes after graduation", "the hardest thing to learn is"
    ]
  },
  {
    category: "Friends & Family",
    queries: [
      "why does my family", "why do friends", "how to make friends", "how to know if someone", "how to cheer someone up",
      "what to say when someone", "what not to say at a wedding", "best gift for someone who", "best family tradition", "things siblings always",
      "things parents always say", "things grandparents know", "things couples argue about", "things friends should never", "is it rude to ask",
      "should i invite everyone", "should i tell my friend", "how long should a party", "what makes a good friend", "what makes a family",
      "funny nickname for", "how to surprise your", "how to apologize for", "what to bring to a party", "the best part of getting together is"
    ]
  },
  {
    category: "Body & Wellness",
    queries: [
      "why do my eyes", "why does my stomach growl", "why does my head", "why do my feet", "why does my hair fall out",
      "is it normal when", "what happens when you exercise", "what happens when you don't sleep", "best way to relax", "best way to wake up refreshed",
      "how to get more energy", "how to fall asleep", "how to stop hiccups", "how to stop sneezing", "why do we dream",
      "why do we get goosebumps", "why do we have fingerprints", "why do we laugh", "why do we yawn", "can humans live without",
      "how many hours should", "what does your body do when", "the strongest muscle is", "the weirdest body part is", "something everyone does in their sleep"
    ]
  },
  {
    category: "Big Curiosities",
    queries: [
      "what would happen if everyone", "what would happen if the moon", "what would happen if the sun", "what would happen without", "what would aliens think of",
      "why is the sky", "why is the ocean", "why is space", "why does time", "can a person survive",
      "could humans ever", "will the world ever", "will robots", "will people live on", "the most mysterious thing about",
      "the strangest thing found in", "the oldest thing in the world is", "the biggest thing in the universe is", "the smallest thing in the world is", "something science cannot explain",
      "if animals could talk", "if time travel were real", "if gravity stopped", "if the internet disappeared", "in one hundred years people will"
    ]
  },
  {
    category: "Finish The Phrase",
    queries: [
      "a watched pot never", "better late than", "when in Rome", "the early bird", "two wrongs don't",
      "don't count your chickens before", "every cloud has", "actions speak louder than", "all that glitters is not", "beauty is in the eye of",
      "birds of a feather", "curiosity killed", "don't put all your eggs", "fortune favors", "good things come to",
      "if it ain't broke", "laughter is the best", "look before you", "practice makes", "the grass is always greener",
      "the pen is mightier than", "too many cooks", "you can lead a horse to water but", "you can't judge a book by", "where there is smoke"
    ]
  }
];

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const cleanQuestionStarter = (value = "") => String(value)
  .replace(/_+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/[?.!,;:]+$/g, "")
  .trim();

export const promptFromQuery = (value) => {
  const query = cleanQuestionStarter(value);
  return query ? `${query.charAt(0).toUpperCase()}${query.slice(1)} ____` : "";
};

export const QUESTION_BANK = PROMPT_GROUPS.flatMap((group) =>
  group.queries.map((query, index) => ({
    id: `${slugify(group.category)}-${String(index + 1).padStart(2, "0")}`,
    category: group.category,
    prompt: promptFromQuery(query),
    query
  }))
);

// Reliable boards retained only for testing before a live provider is connected.
// They are clearly labelled as saved snapshots in the game-creation screen.
export const SNAPSHOT_BANK = [
  { id: "snapshot-how-to", category: "How To", prompt: "How to ____", query: "how to ", answers: ["how to screenshot on mac", "how to tie a tie", "how to delete instagram account", "how to make french toast", "how to lower blood pressure", "how to solve a rubik's cube", "how to write a check"] },
  { id: "snapshot-why-is-my", category: "Life's Mysteries", prompt: "Why is my ____", query: "why is my ", answers: ["why is my phone not charging", "why is my eye twitching", "why is my internet so slow", "why is my cat meowing so much", "why is my dog shaking", "why is my car overheating", "why is my laptop so slow"] },
  { id: "snapshot-can-you-freeze", category: "Kitchen Questions", prompt: "Can you freeze ____", query: "can you freeze ", answers: ["can you freeze eggs", "can you freeze cheese", "can you freeze milk", "can you freeze avocados", "can you freeze cooked rice", "can you freeze cream cheese", "can you freeze bananas"] },
  { id: "snapshot-best-way", category: "Best Way", prompt: "Best way to ____", query: "best way to ", answers: ["best way to lose weight", "best way to cook bacon", "best way to learn spanish", "best way to clean an oven", "best way to save money", "best way to hard boil eggs", "best way to remove wallpaper"] },
  { id: "snapshot-is-it-safe", category: "Should I?", prompt: "Is it safe to ____", query: "is it safe to ", answers: ["is it safe to eat raw cookie dough", "is it safe to travel alone", "is it safe to microwave plastic", "is it safe to sleep with a fan on", "is it safe to eat snow", "is it safe to reheat rice", "is it safe to drink rainwater"] },
  { id: "snapshot-what-happens", category: "What Happens", prompt: "What happens if ____", query: "what happens if ", answers: ["what happens if you don't sleep", "what happens if you swallow gum", "what happens if you eat mold", "what happens if you miss jury duty", "what happens if you drink too much water", "what happens if you stop paying taxes", "what happens if you delete icloud backup"] },
  { id: "snapshot-dogs", category: "Animals", prompt: "Why do dogs ____", query: "why do dogs ", answers: ["why do dogs eat grass", "why do dogs lick you", "why do dogs shake", "why do dogs howl", "why do dogs sleep so much", "why do dogs have whiskers", "why do dogs chase their tails"] },
  { id: "snapshot-people", category: "People", prompt: "People who always ____", query: "people who always ", answers: ["people who always complain", "people who always need attention", "people who always blame others", "people who always interrupt", "people who always talk about themselves", "people who always say sorry", "people who always cancel plans"] },
  { id: "snapshot-need", category: "Do I Need It?", prompt: "Do I need a ____", query: "do i need a ", answers: ["do i need a passport to go to canada", "do i need a lawyer", "do i need a permit to build a shed", "do i need a box spring", "do i need a visa", "do i need a real id to fly", "do i need a will"] },
  { id: "snapshot-bored", category: "Boredom", prompt: "Things to do when ____", query: "things to do when ", answers: ["things to do when bored", "things to do when it rains", "things to do when you can't sleep", "things to do when sick", "things to do when stressed", "things to do when home alone", "things to do when retired"] },
  { id: "snapshot-buy", category: "Shopping", prompt: "Should I buy ____", query: "should i buy ", answers: ["should i buy a house", "should i buy a new car", "should i buy or rent", "should i buy an electric car", "should i buy travel insurance", "should i buy a refurbished phone", "should i buy gold"] },
  { id: "snapshot-why-cant", category: "Why Can't I?", prompt: "Why can't I ____", query: "why can't i ", answers: ["why can't i sleep", "why can't i lose weight", "why can't i cry", "why can't i focus", "why can't i remember anything", "why can't i stop coughing", "why can't i download apps"] }
];

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function buildQuestionQueue(totalRounds, {
  sourceMode = "live",
  excludedIds = [],
  includeOriginal = true,
  includeCustom = true,
  customQuestions = []
} = {}) {
  const approvedCustom = customQuestions.map((question) => ({
    id: question.id || `custom-${question.questionId}`,
    category: question.category || "Community Pick",
    prompt: question.prompt || promptFromQuery(question.query),
    query: cleanQuestionStarter(question.query),
    bank: "custom"
  })).filter((question) => question.id && question.prompt && question.query);
  const originalQuestions = QUESTION_BANK.map((question) => ({ ...question, bank: "original" }));
  const source = sourceMode === "snapshot"
    ? SNAPSHOT_BANK
    : [
        ...(includeOriginal ? originalQuestions : []),
        ...(includeCustom ? approvedCustom : [])
      ];
  if (sourceMode === "snapshot") {
    const testBoards = shuffled(source);
    return Array.from({ length: totalRounds }, (_, index) => ({
      ...testBoards[index % testBoards.length],
      order: index + 1
    }));
  }
  if (!source.length) {
    throw new Error("Turn on the original question bank, approved custom questions, or both.");
  }
  if (source.length < totalRounds) {
    throw new Error(`The selected question banks contain ${source.length} question${source.length === 1 ? "" : "s"}. Enable another bank or reduce the number of rounds.`);
  }
  const excluded = new Set(excludedIds);
  const fresh = source.filter((question) => !excluded.has(question.id));
  const available = fresh.length >= totalRounds ? fresh : source;
  const candidateCount = Math.min(available.length, totalRounds + 12);
  return shuffled(available)
    .slice(0, candidateCount)
    .map((question, index) => ({ ...question, order: index + 1 }));
}
