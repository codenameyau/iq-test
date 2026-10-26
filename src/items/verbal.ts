import type { Rng } from '../core/rng';
import type { ChoiceItem, ItemGenerator } from '../core/types';
import { proceduralNear, tryProcedural } from './verbalProcedural';

/**
 * Hand-authored verbal bank. `options[0]` is the correct answer.
 * `generate` copies a stem and shuffles that copy, so bank order never leaks.
 */
interface VerbalStem {
  id: string;
  b: number;
  a: number;
  prompt: string;
  stimulus: string;
  options: readonly string[];
  explanation: string;
  family: string;
}

type Distractors = readonly [string, string, string, string];
type FiveWords = readonly [string, string, string, string, string];

/** Easy to hard. Each 0.5-wide band from -2.5 through 2.5 holds at least two of these. */
const BAND_B = [
  -2.5, -2.32, -2.12, -1.92, -1.68, -1.42, -1.22, -0.88, -0.62, -0.42, -0.22, -0.08, 0.12, 0.28,
  0.42, 0.58, 0.78, 1.12, 1.32, 1.58, 1.78, 2.08, 2.28, 2.42, 2.55, 2.68,
] as const;

const ANALOGY_PROMPT = 'Complete the analogy.';
const ODD_PROMPT = 'Which word does not belong with the others?';
const SIMILARITY_PROMPT = 'Choose the most important way they are alike, not a surface detail.';
const VOCAB_PROMPT = 'Choose the option closest in meaning to this word.';
const MUST_PROMPT = 'Which statement must be true?';
const ANSWER_PROMPT = 'Read the statements, then answer the question.';

const NEAREST_POOL = 3;

function bandB(n: number): number {
  const b = BAND_B[n - 1];
  if (b === undefined) throw new Error(`Verbal item number ${n} is outside 1..${BAND_B.length}.`);
  return b;
}

function familyOf(id: string): string {
  if (id.startsWith('vb-an')) return 'vb-analogy';
  if (id.startsWith('vb-oo')) return 'vb-odd-one-out';
  if (id.startsWith('vb-si')) return 'vb-similarity';
  if (id.startsWith('vb-vo')) return 'vb-vocabulary';
  if (id.startsWith('vb-de')) return 'vb-deduction';
  throw new Error(`No verbal family for ${id}.`);
}

function stem(
  id: string,
  b: number,
  a: number,
  prompt: string,
  stimulus: string,
  options: readonly string[],
  explanation: string,
): VerbalStem {
  const item: VerbalStem = { id, b, a, prompt, stimulus, options, explanation, family: familyOf(id) };
  Object.freeze(item.options);
  return Object.freeze(item);
}

function analogyItem(
  n: number,
  stimulus: string,
  correct: string,
  distractors: Distractors,
  explanation: string,
  b = bandB(n),
): VerbalStem {
  return stem(
    `vb-an-${String(n).padStart(3, '0')}`,
    b,
    1.4,
    ANALOGY_PROMPT,
    stimulus,
    [correct, ...distractors],
    explanation,
  );
}

function oddOneItem(n: number, listed: FiveWords, odd: string, explanation: string, b = bandB(n)): VerbalStem {
  const others = listed.filter((word) => word !== odd);
  if (others.length !== 4) {
    throw new Error(`Odd-one-out ${n} must list its odd word exactly once.`);
  }
  return stem(
    `vb-oo-${String(n).padStart(3, '0')}`,
    b,
    1.2,
    ODD_PROMPT,
    listed.join(', '),
    [odd, others[0], others[1], others[2], others[3]],
    explanation,
  );
}

function similarityItem(
  n: number,
  stimulus: string,
  correct: string,
  distractors: Distractors,
  explanation: string,
  b = bandB(n),
): VerbalStem {
  return stem(
    `vb-si-${String(n).padStart(3, '0')}`,
    b,
    1.3,
    SIMILARITY_PROMPT,
    stimulus,
    [correct, ...distractors],
    explanation,
  );
}

function vocabularyItem(
  n: number,
  word: string,
  correct: string,
  distractors: Distractors,
  explanation: string,
  b = bandB(n),
): VerbalStem {
  return stem(
    `vb-vo-${String(n).padStart(3, '0')}`,
    b,
    1.1,
    VOCAB_PROMPT,
    word,
    [correct, ...distractors],
    explanation,
  );
}

function deductionItem(
  n: number,
  prompt: string,
  stimulus: string,
  correct: string,
  distractors: Distractors,
  explanation: string,
  b = bandB(n),
): VerbalStem {
  return stem(
    `vb-de-${String(n).padStart(3, '0')}`,
    b,
    1.4,
    prompt,
    stimulus,
    [correct, ...distractors],
    explanation,
  );
}

const analogies: readonly VerbalStem[] = [
  analogyItem(
    1,
    'DAY : NIGHT :: OPEN : ?',
    'CLOSED',
    ['DOOR', 'LIGHT', 'WIDE', 'MORNING'],
    'Night is the opposite of day, so the opposite of open is closed. A door can be open, but it is not itself the opposite.',
  ),
  analogyItem(
    2,
    'BIRD : NEST :: BEE : ?',
    'HIVE',
    ['HONEY', 'FLOWER', 'WING', 'STING'],
    'A nest is where a bird lives, and a hive is where a bee lives. Honey is what a bee makes, not its home.',
  ),
  analogyItem(
    3,
    'EYE : SEE :: EAR : ?',
    'HEAR',
    ['SOUND', 'LOUD', 'DEAF', 'RING'],
    'An eye is used to see, and an ear is used to hear. Sound is what gets heard, not the action that matches see.',
  ),
  analogyItem(
    4,
    'PENCIL : WRITE :: KNIFE : ?',
    'CUT',
    ['SHARP', 'METAL', 'FORK', 'SPOON'],
    'A pencil is a tool for writing, and a knife is a tool for cutting. Sharp describes a knife; it is not the action.',
  ),
  analogyItem(
    5,
    'HUNGER : EAT :: THIRST : ?',
    'DRINK',
    ['WATER', 'CUP', 'DRY', 'FOOD'],
    'Eating relieves hunger, and drinking relieves thirst. Water is what a person drinks, not the action that matches eat.',
  ),
  analogyItem(
    6,
    'AUTHOR : NOVEL :: COMPOSER : ?',
    'SYMPHONY',
    ['PIANO', 'ORCHESTRA', 'CONCERT', 'STAGE'],
    'An author creates a novel, and a composer creates a symphony. An orchestra performs the work; it does not create it as an author creates a novel.',
  ),
  analogyItem(
    7,
    'CLOCK : TIME :: THERMOMETER : ?',
    'TEMPERATURE',
    ['HEAT', 'WEATHER', 'FEVER', 'DEGREE'],
    'A clock measures time, and a thermometer measures temperature. Heat is energy; temperature is the quantity the instrument reads.',
  ),
  analogyItem(
    8,
    'PILOT : AIRCRAFT :: CAPTAIN : ?',
    'SHIP',
    ['SAILOR', 'OCEAN', 'PORT', 'CREW'],
    'A pilot commands an aircraft, and a captain commands a ship. A sailor serves on a ship but does not command it in that way.',
  ),
  analogyItem(
    9,
    'CHAPTER : NOVEL :: ACT : ?',
    'PLAY',
    ['STAGE', 'ACTOR', 'SCENE', 'SCRIPT'],
    'A chapter is a major division of a novel, and an act is a major division of a play. A scene is a smaller division inside an act.',
  ),
  analogyItem(
    10,
    'DROUGHT : RAIN :: FAMINE : ?',
    'FOOD',
    ['HUNGER', 'FEAST', 'WATER', 'THIRST'],
    'A drought is a severe lack of rain, and a famine is a severe lack of food. Hunger is the feeling that follows, not the thing that is missing.',
  ),
  analogyItem(
    11,
    'PRUNE : TREE :: EDIT : ?',
    'TEXT',
    ['WRITE', 'AUTHOR', 'PAPER', 'READ'],
    'Pruning removes unwanted growth from a tree, and editing removes unwanted material from a text. Writing creates text rather than refining it.',
  ),
  analogyItem(
    12,
    'KEY : LOCK :: PASSWORD : ?',
    'ACCOUNT',
    ['LETTER', 'SECRET', 'CODE', 'DOOR'],
    'A key gives access to a lock, and a password gives access to an account. A code is another name for the password, not what it opens.',
  ),
  analogyItem(
    13,
    'WHISPER : SHOUT :: STROLL : ?',
    'SPRINT',
    ['WALK', 'HIKE', 'PATH', 'CRAWL'],
    'A shout is speech at its extreme, and a sprint is going on foot at its extreme. A hike is a long walk, not a faster one.',
  ),
  analogyItem(
    14,
    'SEED : PLANT :: EGG : ?',
    'BIRD',
    ['SHELL', 'NEST', 'FEATHER', 'YOLK'],
    'A seed develops into a plant, and an egg develops into a bird. The shell and yolk are parts of the egg, not what it becomes.',
    -0.62,
  ),
  analogyItem(
    15,
    'REHEARSAL : PERFORMANCE :: DRAFT : ?',
    'PUBLICATION',
    ['AUTHOR', 'EDIT', 'READER', 'PAPER'],
    'A rehearsal is the preparation for a performance, and a draft is the preparation for a publication. Editing is work done on a draft, not the finished counterpart.',
  ),
  analogyItem(
    16,
    'SPEEDOMETER : SPEED :: ODOMETER : ?',
    'DISTANCE',
    ['MILE', 'ROAD', 'WHEEL', 'FUEL'],
    'A speedometer measures speed, and an odometer measures distance travelled. A mile is a unit of that distance, not the quantity named as speed is named.',
  ),
  analogyItem(
    17,
    'ARCHIPELAGO : ISLAND :: BOUQUET : ?',
    'FLOWER',
    ['GARDEN', 'PETAL', 'VASE', 'SCENT'],
    'An archipelago is a group of islands, and a bouquet is a group of flowers. A petal is part of a flower, and a garden is a place where flowers grow.',
  ),
  analogyItem(
    18,
    'PROLOGUE : EPILOGUE :: DAWN : ?',
    'DUSK',
    ['NOON', 'DAY', 'SUNRISE', 'SUN'],
    'A prologue opens a work and an epilogue closes it; dawn opens the day and dusk closes it. Sunrise is another name for dawn, and noon is the middle.',
  ),
  analogyItem(
    19,
    'OUTLINE : ESSAY :: SKETCH : ?',
    'PAINTING',
    ['PENCIL', 'ARTIST', 'CANVAS', 'FRAME'],
    'An outline is a sparse plan of an essay, and a sketch is a sparse plan of a painting. A pencil and a canvas are materials, not the finished work.',
    0.58,
  ),
  analogyItem(
    20,
    'RECLUSE : SOLITUDE :: PHILANTHROPIST : ?',
    'GENEROSITY',
    ['WEALTH', 'POVERTY', 'FAME', 'GRATITUDE'],
    'A recluse is defined by seeking solitude, and a philanthropist by generosity. Many philanthropists are wealthy, but wealth is not what the word means; gratitude is what recipients feel.',
  ),
  analogyItem(
    21,
    'PARSIMONIOUS : SPEND :: TACITURN : ?',
    'SPEAK',
    ['SILENT', 'QUIET', 'LISTEN', 'WORD'],
    'A parsimonious person is unwilling to spend, and a taciturn person is unwilling to speak. Silent describes the result, and listen is the other side of a conversation.',
  ),
  analogyItem(
    22,
    'ASCETIC : LUXURY :: MISER : ?',
    'EXTRAVAGANCE',
    ['MONEY', 'WEALTH', 'POVERTY', 'GREED'],
    'An ascetic turns away from luxury, and a miser turns away from extravagance. Greed may drive a miser, but it is not the indulgence being refused.',
  ),
  analogyItem(
    23,
    'OBFUSCATE : CLARITY :: EMBELLISH : ?',
    'PLAINNESS',
    ['BEAUTY', 'DETAIL', 'ORNAMENT', 'ELEGANCE'],
    'To obfuscate is to take away clarity, and to embellish is to take away plainness. Beauty and ornament are what embellishment adds, not the quality it removes.',
  ),
  analogyItem(
    27,
    'ANTIDOTE : POISON :: REFUTATION : ?',
    'ARGUMENT',
    ['PROOF', 'DEBATE', 'EVIDENCE', 'LOGIC'],
    'An antidote counters a poison, and a refutation counters an argument. Proof and evidence are what a refutation uses, and a debate is where it happens.',
    2.2,
  ),
  analogyItem(
    28,
    'INSIPID : TASTE :: BANAL : ?',
    'ORIGINALITY',
    ['SUGAR', 'ACCURACY', 'LENGTH', 'GRAMMAR'],
    'Insipid means lacking taste, and banal means lacking originality. A banal remark can be accurate, long and grammatical; what it lacks is anything new.',
    1.9,
  ),
  analogyItem(
    26,
    'CONDUCIVE : PROMOTE :: SYMPTOMATIC : ?',
    'INDICATE',
    ['CAUSE', 'PROVE', 'TREAT', 'SUFFER'],
    'Conducive means tending to promote, and symptomatic means tending to indicate. Cause treats the sign as the producer, and prove claims more certainty than a symptom has.',
    2.52,
  ),
];

const oddOnes: readonly VerbalStem[] = [
  oddOneItem(
    1,
    ['RED', 'BLUE', 'CHAIR', 'YELLOW', 'GREEN'],
    'CHAIR',
    'Red, blue, yellow and green are colours. A chair is a piece of furniture.',
  ),
  oddOneItem(
    2,
    ['APPLE', 'BANANA', 'GRAPE', 'CARROT', 'ORANGE'],
    'CARROT',
    'Apple, banana, grape and orange are fruits. A carrot is a vegetable.',
  ),
  oddOneItem(
    3,
    ['DOG', 'CAT', 'HORSE', 'SPARROW', 'COW'],
    'SPARROW',
    'Dog, cat, horse and cow are mammals. A sparrow is a bird.',
  ),
  oddOneItem(
    4,
    ['SQUARE', 'TRIANGLE', 'HEXAGON', 'SPHERE', 'PENTAGON'],
    'SPHERE',
    'Square, triangle, hexagon and pentagon are flat shapes with straight sides. A sphere is a solid.',
  ),
  oddOneItem(
    5,
    ['SEE', 'HEAR', 'SMELL', 'JUMP', 'TASTE'],
    'JUMP',
    'Seeing, hearing, smelling and tasting are senses. Jumping is a movement.',
  ),
  oddOneItem(
    6,
    ['PIANO', 'VIOLIN', 'FLUTE', 'MICROPHONE', 'DRUM'],
    'MICROPHONE',
    'Piano, violin, flute and drum are musical instruments. A microphone captures sound; it is not played as an instrument.',
  ),
  oddOneItem(
    7,
    ['ADDITION', 'SUBTRACTION', 'MULTIPLICATION', 'NUMBER', 'DIVISION'],
    'NUMBER',
    'Addition, subtraction, multiplication and division are operations. A number is what those operations apply to.',
  ),
  oddOneItem(
    8,
    ['COAT', 'SHIRT', 'DRESS', 'HANGER', 'SKIRT'],
    'HANGER',
    'A coat, shirt, dress and skirt are garments. A hanger holds clothes; it is not clothing.',
    -1.5,
  ),
  oddOneItem(
    9,
    ['BICYCLE', 'CAR', 'TRAIN', 'BUS', 'ROAD'],
    'ROAD',
    'A bicycle, car, train and bus are vehicles. A road is what some vehicles travel on; it is not a vehicle.',
    -1.4,
  ),
  oddOneItem(
    10,
    ['WHISPER', 'MURMUR', 'SHOUT', 'LISTEN', 'YELL'],
    'LISTEN',
    'Whisper, murmur, shout and yell are ways of using the voice. Listening is a way of receiving sound.',
    -0.9,
  ),
  oddOneItem(
    11,
    ['NOVEL', 'POEM', 'STATUE', 'ESSAY', 'FABLE'],
    'STATUE',
    'A novel, poem, essay and fable are literary works. A statue is a sculpture.',
    -0.8,
  ),
  oddOneItem(
    27,
    ['BROOK', 'STREAM', 'RIVER', 'POND', 'CREEK'],
    'POND',
    'A brook, stream, river and creek are bodies of flowing water. A pond is still water.',
    -0.08,
  ),
  oddOneItem(
    28,
    ['TON', 'OUNCE', 'GRAM', 'MILE', 'KILOGRAM'],
    'MILE',
    'Ton, ounce, gram and kilogram are units of weight, whether metric or not. A mile is a unit of length.',
    -0.3,
  ),
  oddOneItem(
    14,
    ['COD', 'SALMON', 'TROUT', 'DOLPHIN', 'TUNA'],
    'DOLPHIN',
    'Cod, salmon, trout and tuna are fish. A dolphin lives in the sea but is a mammal.',
    -0.3,
  ),
  oddOneItem(
    15,
    ['GENEROUS', 'HONEST', 'WEALTHY', 'BRAVE', 'PATIENT'],
    'WEALTHY',
    'Generous, honest, brave and patient are qualities of character. Wealthy describes how much money someone has.',
  ),
  oddOneItem(
    16,
    ['DEDUCE', 'INFER', 'SPECULATE', 'CONCLUDE', 'DERIVE'],
    'SPECULATE',
    'Deduce, infer, conclude and derive mean reaching a result from grounds already in hand. Speculate means to guess beyond those grounds.',
  ),
  oddOneItem(
    17,
    ['WALK', 'RUN', 'DRIVE', 'HOP', 'CRAWL'],
    'DRIVE',
    'Walking, running, hopping and crawling move the body itself. Driving moves a vehicle.',
    -0.3,
  ),
  oddOneItem(
    18,
    ['HUMID', 'DAMP', 'ARID', 'MOIST', 'SODDEN'],
    'ARID',
    'Humid, damp, moist and sodden all mean wet, to different degrees. Arid means dry.',
    0.6,
  ),
  oddOneItem(
    19,
    ['BENEVOLENT', 'COMPASSIONATE', 'CALLOUS', 'CHARITABLE', 'KIND'],
    'CALLOUS',
    'Benevolent, compassionate, charitable and kind all mean disposed to care for others. Callous means emotionally hard and uncaring.',
    0.8,
  ),
  oddOneItem(
    20,
    ['AMBIGUOUS', 'EQUIVOCAL', 'VAGUE', 'EXPLICIT', 'IMPRECISE'],
    'EXPLICIT',
    'Ambiguous, equivocal, vague and imprecise all mean not clearly fixed. Explicit means stated so that the meaning is clear.',
    0.9,
  ),
  oddOneItem(
    21,
    ['FLEETING', 'MOMENTARY', 'TRANSIENT', 'ENDURING', 'EVANESCENT'],
    'ENDURING',
    'Fleeting, momentary, transient and evanescent all mean lasting only a short time. Enduring means lasting.',
    1.2,
  ),
  oddOneItem(
    22,
    ['STUBBORN', 'OBSTINATE', 'DOGMATIC', 'INFLEXIBLE', 'PERSISTENT'],
    'PERSISTENT',
    'Stubborn, obstinate, dogmatic and inflexible all mean refusing to change a position. Persistent means continuing an effort, which does not require that refusal.',
  ),
  oddOneItem(
    23,
    ['ECONOMICAL', 'FRUGAL', 'THRIFTY', 'SPARING', 'STINGY'],
    'STINGY',
    'Economical, frugal, thrifty and sparing mean careful with resources. Stingy adds a refusal to give that the others do not require.',
  ),
  oddOneItem(
    24,
    ['IMPLY', 'SUGGEST', 'HINT', 'INDICATE', 'INFER'],
    'INFER',
    'Imply, suggest, hint and indicate are ways a speaker or sign conveys something. Infer is what a listener does with what was conveyed.',
  ),
  oddOneItem(
    25,
    ['NECESSARY', 'REQUIRED', 'ESSENTIAL', 'OBLIGATORY', 'SUFFICIENT'],
    'SUFFICIENT',
    'Necessary, required, essential and obligatory all mean that something cannot be done without. Sufficient means enough on its own, which does not mean it was required.',
    1.32,
  ),
  oddOneItem(
    26,
    ['OBJECTIVE', 'IMPARTIAL', 'UNBIASED', 'NEUTRAL', 'INDIFFERENT'],
    'INDIFFERENT',
    'Objective, impartial, unbiased and neutral all mean not taking a side. Indifferent means not caring about the outcome, which is a different thing from fairness.',
    2.28,
  ),
  oddOneItem(
    29,
    ['LOQUACIOUS', 'GARRULOUS', 'VOLUBLE', 'VERBOSE', 'LACONIC'],
    'LACONIC',
    'Loquacious, garrulous, voluble and verbose all describe using a great many words. Laconic means using very few.',
    2.55,
  ),
];

const similarities: readonly VerbalStem[] = [
  similarityItem(
    1,
    'In what way are an APPLE and a BANANA alike?',
    'Both are fruits.',
    [
      'Both are long and curved.',
      'Both grow under the ground.',
      'Both are sold in shops.',
      'Both are vegetables.',
    ],
    'The shared category is fruit. An apple is not long and curved, neither grows underground, and being sold in shops is true of almost any goods.',
  ),
  similarityItem(
    2,
    'In what way are a SPOON and a FORK alike?',
    'Both are utensils used for eating.',
    [
      'Both have sharp prongs.',
      'Both are kinds of food.',
      'Both cut food as a knife does.',
      'Both are worn on the head.',
    ],
    'A spoon and a fork are eating utensils. A spoon has no prongs, and a spoon does not cut food.',
  ),
  similarityItem(
    3,
    'In what way are a SHIRT and TROUSERS alike?',
    'Both are garments.',
    [
      'Both are worn on the legs.',
      'Both have sleeves.',
      'Both are kinds of footwear.',
      'Both are types of hat.',
    ],
    'Both are clothing. A shirt is not worn on the legs, and trousers do not have sleeves.',
  ),
  similarityItem(
    4,
    'In what way are a HAMMER and a SAW alike?',
    'Both are tools.',
    [
      'Both are used to drive in nails.',
      'Both are used to cut wood.',
      'Both are musical instruments.',
      'Both are pieces of furniture.',
    ],
    'Both are tools. A saw does not drive in nails, and a hammer is not used to cut wood.',
  ),
  similarityItem(
    5,
    'In what way are MILK and JUICE alike?',
    'Both are drinks.',
    [
      'Both come from cows.',
      'Both are white.',
      'Both are made only from fruit.',
      'Both are kinds of bread.',
    ],
    'Milk and juice are drinks. Juice does not come from cows, and milk is not made from fruit.',
  ),
  similarityItem(
    6,
    'In what way are a CLOCK and a CALENDAR alike?',
    'Both are used to track time.',
    [
      'Both name the hour of the day.',
      'Both are worn on the wrist.',
      'Both measure weight.',
      'Both are kinds of money.',
    ],
    'A clock and a calendar both keep track of time. A calendar does not name the hour, and neither one measures weight.',
  ),
  similarityItem(
    7,
    'In what way are a CAR and a BICYCLE alike?',
    'Both are vehicles.',
    [
      'Both have four wheels.',
      'Both are powered by an engine.',
      'Both run on rails.',
      'Both are kinds of boat.',
    ],
    'Both are vehicles. A bicycle has two wheels and no engine.',
  ),
  similarityItem(
    8,
    'In what way are RAIN and SNOW alike?',
    'Both are water that falls from clouds.',
    [
      'Both are frozen water.',
      'Both can make the ground wet.',
      'Both can reduce how far a person can see.',
      'Both are more common in some seasons than others.',
    ],
    'Rain and snow are water falling from clouds. Rain is not frozen, and wetting the ground or blocking the view is true but stops at the surface.',
  ),
  similarityItem(
    9,
    'In what way are an EYE and an EAR alike?',
    'Both are sense organs.',
    [
      'Both are parts of the head.',
      'Both come in a pair.',
      'Both can be injured.',
      'Both are present in a typical human body.',
    ],
    'The essential similarity is that both are sense organs. Location on the head, and coming in a pair, are true but more concrete.',
  ),
  similarityItem(
    10,
    'In what way are a DICTIONARY and an ENCYCLOPEDIA alike?',
    'Both are reference books.',
    [
      'Both are books.',
      'Both contain many short entries.',
      'Both are used by students.',
      'Both can be published in more than one volume.',
    ],
    'Both are reference books. Being books, or having short entries, is true but does not say what they are for.',
  ),
  similarityItem(
    11,
    'In what way are a POEM and a STATUE alike?',
    'Both are works of art.',
    [
      'Both are made by people.',
      'Both may be displayed in public.',
      'Both can be the work of one maker.',
      'Both take time to create.',
    ],
    'The essential similarity is that both are works of art. Being made by people is true of tools and meals as well, so it is too broad.',
  ),
  similarityItem(
    12,
    'In what way are a DOG and a CAT alike?',
    'Both are mammals.',
    [
      'Both have four legs.',
      'Both have fur.',
      'Both can live in a house.',
      'Both make sounds.',
    ],
    'Both are mammals. Four legs, fur and making sounds are familiar features, not the category they share.',
  ),
  similarityItem(
    13,
    'In what way are a BRIDGE and a TUNNEL alike?',
    'Both let people pass an obstacle.',
    [
      'Both are built by people.',
      'Both can carry a road.',
      'Both can be used by vehicles.',
      'Both take a long time to construct.',
    ],
    'A bridge carries a path over an obstacle and a tunnel carries it through one. Carrying a road is one use of that, not the shared purpose.',
  ),
  similarityItem(
    14,
    'In what way are a SEED and an EGG alike?',
    'Both can develop into a new organism.',
    [
      'Both are foods people eat.',
      'Both have a protective outer layer.',
      'Both are small relative to the organism that produced them.',
      'Both are produced by a living thing.',
    ],
    'Each can develop into a new living thing. An outer layer, and being produced by a living thing, are true but shallower.',
  ),
  similarityItem(
    15,
    'In what way are a MAP and a COMPASS alike?',
    'Both are used to find the way.',
    [
      'Both are tools.',
      'Both are carried on trips.',
      'Both can be held in one hand.',
      'Both are used outdoors.',
    ],
    'Both help a person navigate. Being tools, or being carried on trips, is true of many objects that do not share that job.',
  ),
  similarityItem(
    16,
    'In what way are a MIRROR and an ECHO alike?',
    'Both send back a version of what reaches them.',
    [
      'Both can be noticed by the senses.',
      'Both require something to arrive first.',
      'Both can be stronger or weaker.',
      'Both occur in everyday places.',
    ],
    'A mirror sends light back and an echo sends sound back. Noticing them by the senses is true of almost any event.',
  ),
  similarityItem(
    17,
    'In what way are LAW and GRAMMAR alike?',
    'Both are systems of rules.',
    [
      'Both are taught in school.',
      'Both can be written down.',
      'Both change over time.',
      'Both can be broken.',
    ],
    'Law and grammar are both systems of rules. Being taught, or being breakable, is a consequence of that and not the similarity itself.',
  ),
  similarityItem(
    18,
    'In what way are a VACCINE and a SEATBELT alike?',
    'Both are used in advance to reduce the chance of harm.',
    [
      'Both are required by rules in some places.',
      'Both can fail to prevent every harm.',
      'Both are designed by people.',
      'Both are kept ready until they are needed.',
    ],
    'Both are protections used beforehand to reduce harm. Being required, or being designed by people, is true but not what they are for.',
  ),
  similarityItem(
    19,
    'In what way are CENSORSHIP and SECRECY alike?',
    'Both restrict what information reaches people.',
    [
      'Both can be practised by a government.',
      'Both can be defended as a form of protection.',
      'Both have critics.',
      'Both can apply to written material.',
    ],
    'Both limit which information reaches people. A government, or a written page, is only one setting in which that happens.',
  ),
  similarityItem(
    20,
    'In what way are NOSTALGIA and REGRET alike?',
    'Both are feelings about the past.',
    [
      'Both are feelings.',
      'Both can be strong or mild.',
      'Both can arise when nothing new is happening.',
      'Both can influence a later decision.',
    ],
    'Both are feelings directed at the past. Calling both feelings is true and stops short of what they are about.',
  ),
  similarityItem(
    21,
    'In what way are SATIRE and CARICATURE alike?',
    'Both use exaggeration to make fun of a subject.',
    [
      'Both depict a recognizable subject.',
      'Both are made by a person.',
      'Both can appear in a newspaper.',
      'Both can annoy their subject.',
    ],
    'Both exaggerate a subject to make fun of it. Depicting a recognizable subject is true of a portrait as well.',
  ),
  similarityItem(
    22,
    'In what way are an AMNESTY and a PARDON alike?',
    'Both lift a penalty.',
    [
      'Both are decisions made by an authority.',
      'Both concern a person who broke a rule.',
      'Both are recorded in official language.',
      'Both can be announced in public.',
    ],
    'An amnesty and a pardon both cancel a penalty. Being a public decision by an authority is how that often happens, not what they share.',
  ),
  similarityItem(
    27,
    'In what way are DOUBT and CAUTION alike?',
    'Both hold back from full commitment until there is a reason to go on.',
    [
      'Both can slow a decision down.',
      'Both can be wise in one case and excessive in another.',
      'Both are signs of fear.',
      'Both can be recommended to a beginner.',
    ],
    'Both hold back until there is a reason to go on. Slowing a decision is a common result of that, and neither one requires fear.',
    1.58,
  ),
  similarityItem(
    24,
    'In what way are a PARADOX and an OXYMORON alike?',
    'Both place apparently contradictory ideas together.',
    [
      'Both can be used for emphasis.',
      'Both appear in literature and in ordinary speech.',
      'Both can be shorter than a paragraph.',
      'Both invite a reader to pause.',
    ],
    'Both join ideas that seem to conflict. Emphasis, and a pause, are effects of that clash rather than the clash itself.',
  ),
  similarityItem(
    25,
    'In what way are a PROTOTYPE and an ARCHETYPE alike?',
    'Both are original models that later examples follow.',
    [
      'Both come before the examples that follow them.',
      'Both are the final, finished version of a design.',
      'Both are copies of something that existed earlier.',
      'Both are one model rather than the whole group of examples.',
    ],
    'A prototype and an archetype are models later examples follow. Coming earlier is true, and it leaves out the role of a model; neither is a finished version or a copy.',
    1.78,
  ),
  similarityItem(
    26,
    'In what way are a EUPHEMISM and an UNDERSTATEMENT alike?',
    'Both put something in milder terms than a blunt statement would.',
    [
      'Both can be used in order to be polite.',
      'Both exaggerate a fact to make it vivid.',
      'Both are choices about how to phrase a fact.',
      'Both can be made in a single sentence.',
    ],
    'Both soften how a fact is put. Politeness is only one motive, and exaggeration is the opposite move, made by hyperbole.',
    2.52,
  ),
];

const vocabulary: readonly VerbalStem[] = [
  vocabularyItem(
    1,
    'BIG',
    'Large in size',
    ['Small in size', 'Slow in movement', 'Sad in mood', 'Soft to the touch'],
    'Big means large in size. Small is the opposite, not a near meaning.',
  ),
  vocabularyItem(
    2,
    'HAPPY',
    'Feeling joy',
    ['Feeling sorrow', 'Feeling anger', 'Feeling hunger', 'Feeling illness'],
    'Happy means feeling joy. Sorrow is the opposite mood.',
  ),
  vocabularyItem(
    3,
    'BEGIN',
    'To start',
    ['To finish', 'To forget', 'To hide', 'To break'],
    'Begin means to start. Finish is the opposite end of an activity.',
  ),
  vocabularyItem(
    4,
    'GIFT',
    'Something given freely',
    ['Something stolen', 'Something owed', 'A punishment', 'A secret plan'],
    'A gift is something given freely. Something stolen or owed is not a gift.',
  ),
  vocabularyItem(
    5,
    'BRAVE',
    'Willing to face danger',
    ['Afraid of danger', 'Unable to move', 'Unwilling to share', 'Quick to forget'],
    'Brave means willing to face danger. Being afraid of danger is the opposite.',
  ),
  vocabularyItem(
    6,
    'ANCIENT',
    'Very old',
    ['Very new', 'Very small', 'Very loud', 'Very sweet'],
    'Ancient means very old. New is the opposite age.',
  ),
  vocabularyItem(
    7,
    'RAPID',
    'Very fast',
    ['Very slow', 'Very heavy', 'Very rare', 'Very dull'],
    'Rapid means very fast. Slow is the opposite speed.',
  ),
  vocabularyItem(
    8,
    'SCARCE',
    'In short supply',
    [
      'Available in great quantity',
      'Hard to find because it is hidden',
      'Wanted by a great many people',
      'Frightening to look at',
    ],
    'Scarce means in short supply. Being hidden, or being wanted, can go with scarcity but is not what the word means; frightening is scary, not scarce.',
  ),
  vocabularyItem(
    9,
    'CONCEAL',
    'To keep from view',
    [
      'To show openly',
      'To cover with a lid or a cloth',
      'To refuse to answer a question',
      'To change how something looks',
    ],
    'Conceal means to keep from view. Covering with a cloth is one method, and changing how something looks is disguise rather than hiding.',
  ),
  vocabularyItem(
    10,
    'VAST',
    'Extremely large in extent',
    [
      'Extremely small',
      'Spread across many separate places',
      'Too large to cross easily',
      'Famous because of its size',
    ],
    'Vast means extremely large in extent. Being hard to cross is a consequence, and fame is not part of the meaning.',
  ),
  vocabularyItem(
    11,
    'FRAGILE',
    'Easily broken',
    ['Hard to break', 'Delicate in appearance', 'Heavy and awkward to carry', 'Thin and light in build'],
    'Fragile means easily broken. A delicate look, or a thin build, often goes with that and is not the meaning.',
  ),
  vocabularyItem(
    12,
    'TIMID',
    'Shy and easily frightened',
    [
      'Bold and confident',
      'Quiet when speaking',
      'Small in size',
      'Rude to strangers',
    ],
    'Timid means shy and easily frightened. Quiet speech is a common sign, not the definition, and timid says nothing about size.',
  ),
  vocabularyItem(
    13,
    'ABUNDANT',
    'Present in large quantity',
    [
      'Present in very small quantity',
      'Belonging to a single owner',
      'Easy to obtain',
      'Growing only in the wild',
    ],
    'Abundant means present in large quantity. Being easy to obtain is a usual result, not the meaning, and the word says nothing about owners or where things grow.',
  ),
  vocabularyItem(
    14,
    'CAUTIOUS',
    'Careful to avoid risk',
    [
      'Reckless about risk',
      'Slow to reach a decision',
      'Eager to take part',
      'Unwilling to trust a stranger',
    ],
    'Cautious means careful to avoid risk. Slowness and distrust are common companions of that care, not the meaning.',
  ),
  vocabularyItem(
    15,
    'DILIGENT',
    'Steady and hard-working',
    [
      'Lazy and careless',
      'Gifted with natural talent',
      'Working for long hours',
      'Quick to finish a task',
    ],
    'Diligent means steady and hard-working. Long hours often accompany that and are not required by the word, and talent or speed is a different quality.',
  ),
  vocabularyItem(
    16,
    'AMBIGUOUS',
    'Open to more than one meaning',
    [
      'Having one clear meaning',
      'Able to use both hands equally well',
      'Stated in very formal words',
      'Hard to translate into another language',
    ],
    'Ambiguous means open to more than one meaning. Using both hands equally well is ambidextrous, a look-alike word.',
  ),
  vocabularyItem(
    17,
    'PRAGMATIC',
    'Guided by practical results',
    [
      'Guided only by abstract theory',
      'Strict about following rules',
      'Fond of planning far ahead',
      'Quick to lose patience',
    ],
    'Pragmatic means guided by practical results. Theory and strict rules are what a pragmatic person sets aside, and planning or impatience is a different trait.',
  ),
  vocabularyItem(
    18,
    'EPHEMERAL',
    'Lasting a very short time',
    [
      'Lasting forever',
      'Light and airy in texture',
      'Belonging to the spirit world',
      'Delicate and easy to miss',
    ],
    'Ephemeral means lasting a very short time. Belonging to the spirit world is closer to ethereal, a look-alike word, and being easy to miss is not required.',
  ),
  vocabularyItem(
    19,
    'METICULOUS',
    'Extremely careful about small details',
    [
      'Careless about details',
      'Very fast at a task',
      'Slow because of repeated checking',
      'Fond of strict rules',
    ],
    'Meticulous means extremely careful about small details. Slow checking is a frequent sign, not the meaning.',
    0.78,
  ),
  vocabularyItem(
    20,
    'LACONIC',
    'Using very few words',
    [
      'Using far too many words',
      'Slow to give an answer',
      'Lazy and slow-moving',
      'Speaking in a flat tone',
    ],
    'Laconic means using very few words. Lazy and slow-moving is closer to lackadaisical, and a flat tone is a different feature of speech.',
  ),
  vocabularyItem(
    21,
    'EQUIVOCAL',
    'Able to be taken in two ways',
    [
      'Completely definite',
      'Equal in amount',
      'Calm under pressure',
      'Spoken in a loud voice',
    ],
    'Equivocal means able to be taken in two ways. Equal in amount copies the look of the word, and calm and loudness are unrelated.',
  ),
  vocabularyItem(
    22,
    'OBSEQUIOUS',
    'Excessively eager to please people in power',
    [
      'Openly defiant towards authority',
      'Respectful towards authority',
      'Eager for approval',
      'Submissive during an argument',
    ],
    'Obsequious means excessively eager to please people in power. Respect and a wish for approval leave out the excess that the word requires.',
  ),
  vocabularyItem(
    23,
    'UBIQUITOUS',
    'Found everywhere',
    [
      'Found nowhere',
      'Found in many places',
      'So common that it escapes notice',
      'Present in every example of its kind',
    ],
    'Ubiquitous means found everywhere. Found in many places is weaker, and being present in every example of a kind is a different claim.',
  ),
  vocabularyItem(
    24,
    'ENERVATE',
    'To sap strength or vitality',
    [
      'To fill with energy',
      'To make nervous',
      'To irritate persistently',
      'To excite for a short time',
    ],
    'Enervate means to sap strength. Filling with energy is the opposite suggested by the sound, and making nervous copies the look of nerve.',
    2.52,
  ),
  vocabularyItem(
    25,
    'COMPLACENT',
    'Smugly satisfied and unwilling to improve',
    [
      'Eager to please other people',
      'Willing to obey a request',
      'Made up of many parts',
      'Pleased for the moment by a success',
    ],
    'Complacent means smugly satisfied and unwilling to improve. Eager to please is complaisant, willing to obey is compliant, and a passing pleasure leaves out the smug refusal.',
    1.6,
  ),
  vocabularyItem(
    26,
    'DIFFIDENT',
    'Shy from a lack of confidence',
    [
      'Not the same as other things',
      'Having no interest either way',
      'Lacking a settled opinion',
      'Reluctant to trust other people',
    ],
    'Diffident means shy from a lack of confidence. Different and indifferent are look-alike traps, and distrust is a neighbouring attitude rather than shyness.',
    2.55,
  ),
  vocabularyItem(
    27,
    'PUSILLANIMOUS',
    'Lacking courage',
    ['Generous in spirit', 'In full agreement', 'Fond of animals', 'Very small in size'],
    'Pusillanimous means lacking courage. Generous in spirit is magnanimous and full agreement is unanimous, two look-alike words.',
    2.6,
  ),
];

const deductions: readonly VerbalStem[] = [
  deductionItem(
    1,
    ANSWER_PROMPT,
    'Ana is older than Ben. Ben is older than Cy. Who is the oldest?',
    'Ana',
    ['Ben', 'Cy', 'They are the same age', 'It cannot be determined'],
    'Ana is older than Ben, and Ben is older than Cy, so Ana is older than both of the others.',
  ),
  deductionItem(
    2,
    MUST_PROMPT,
    'All dogs are animals. This creature is a dog.',
    'This creature is an animal.',
    [
      'All animals are dogs.',
      'This creature is not an animal.',
      'This creature is a plant.',
      'No dogs are animals.',
    ],
    'Every dog is an animal, and this creature is a dog, so it is an animal. The reverse claim, that every animal is a dog, does not follow.',
  ),
  deductionItem(
    3,
    MUST_PROMPT,
    'If it is raining, then the ground is wet. It is raining.',
    'The ground is wet.',
    [
      'The ground is dry.',
      'It is not raining.',
      'The ground was never wet.',
      'Rain has nothing to do with the ground.',
    ],
    'The rule says rain is enough to make the ground wet, and it is raining, so the ground is wet.',
  ),
  deductionItem(
    4,
    MUST_PROMPT,
    'All squares are rectangles. This shape is not a rectangle.',
    'This shape is not a square.',
    [
      'This shape is a square.',
      'All rectangles are squares.',
      'This shape is a circle.',
      'No rectangles are squares.',
    ],
    'If the shape were a square, it would be a rectangle, so a shape that is not a rectangle cannot be a square. It need not be a circle.',
  ),
  deductionItem(
    5,
    ANSWER_PROMPT,
    'A pencil costs more than a pen. A pen costs more than an eraser. Which item costs the least?',
    'The eraser',
    ['The pen', 'The pencil', 'The pencil and the pen cost the same', 'It cannot be determined'],
    'The pencil costs more than the pen, and the pen costs more than the eraser, so the eraser costs the least.',
  ),
  deductionItem(
    6,
    MUST_PROMPT,
    'No reptiles are mammals. All snakes are reptiles.',
    'No snakes are mammals.',
    [
      'All mammals are snakes.',
      'Some snakes are mammals.',
      'All reptiles are snakes.',
      'Some mammals are reptiles.',
    ],
    'Every snake is a reptile, and no reptile is a mammal, so no snake is a mammal. It does not follow that every reptile is a snake.',
  ),
  deductionItem(
    7,
    ANSWER_PROMPT,
    'There are exactly three boxes in a row: one red, one blue and one green. The red box is left of the blue box. The green box is right of the blue box. Which box is in the middle?',
    'The blue box',
    ['The red box', 'The green box', 'Either the red box or the green box', 'It cannot be determined'],
    'With three boxes, red somewhere left of blue and green somewhere right of blue, the only order is red, blue, green. Blue is in the middle.',
  ),
  deductionItem(
    8,
    MUST_PROMPT,
    'If the lamp is on, then the room is bright. The room is not bright.',
    'The lamp is not on.',
    [
      'The lamp is on.',
      'It cannot be determined whether the lamp is on.',
      'The room is dark for a reason other than the lamp.',
      'The lamp is off and also broken.',
    ],
    'If the lamp were on, the room would be bright, so the lamp is not on. A further cause, or a broken lamp, is not required.',
  ),
  deductionItem(
    9,
    ANSWER_PROMPT,
    'Ana is older than Ben. Ben is older than Cy. Dee is younger than Cy. Who is the second youngest?',
    'Cy',
    ['Ana', 'Ben', 'Dee', 'It cannot be determined'],
    'From oldest to youngest they are Ana, Ben, Cy, Dee. Dee is the youngest, so Cy is second youngest.',
  ),
  deductionItem(
    10,
    MUST_PROMPT,
    'Some artists are poets. All poets are readers.',
    'Some artists are readers.',
    [
      'All artists are readers.',
      'All readers are artists.',
      'No artists are readers.',
      'Some poets are not readers.',
    ],
    'The artists who are poets must be readers, because every poet is a reader. It does not follow that every artist is a reader.',
  ),
  deductionItem(
    11,
    MUST_PROMPT,
    'If the button is pressed, the bell rings. If the bell rings, the dog barks. The button is pressed.',
    'The dog barks.',
    [
      'The dog barks only if the button is pressed.',
      'The button was pressed because the dog barked.',
      'The dog would bark even if the button were not pressed.',
      'The bell rings only when the dog is already barking.',
    ],
    'Pressing the button rings the bell, and the bell makes the dog bark, so the dog barks. The rules do not run backwards from the bark to the button.',
  ),
  deductionItem(
    12,
    MUST_PROMPT,
    'All pilots are swimmers. No swimmers are painters.',
    'No pilots are painters.',
    [
      'All swimmers are pilots.',
      'Some painters are pilots.',
      'All painters are swimmers.',
      'No swimmers are pilots.',
    ],
    'Every pilot is a swimmer, and no swimmer is a painter, so no pilot is a painter. The swimmers need not all be pilots.',
  ),
  deductionItem(
    13,
    MUST_PROMPT,
    'There are several cookies. Not all of them are burnt.',
    'At least one cookie is not burnt.',
    [
      'Every cookie is burnt.',
      'No cookie is burnt.',
      'Most of the cookies are burnt.',
      'Exactly one cookie is not burnt.',
    ],
    'Not all of them are burnt means that at least one is not burnt. It does not say how many, so exactly one, or most burnt, does not follow.',
  ),
  deductionItem(
    14,
    ANSWER_PROMPT,
    'Four people are in a single-file line. Nia is ahead of Omar, Omar is ahead of Pri, and Pri is ahead of Quinn. How many people are ahead of Pri?',
    'Two',
    ['None', 'One', 'Three', 'It cannot be determined'],
    'Nia is ahead of Omar and Omar is ahead of Pri, so both are ahead of Pri. Only Quinn is behind Pri, which leaves exactly two people ahead.',
  ),
  deductionItem(
    15,
    MUST_PROMPT,
    'The meeting is on Monday or on Thursday, but not on both. The meeting is not on Monday.',
    'The meeting is on Thursday.',
    [
      'The meeting is on Monday.',
      'The meeting is on both days.',
      'The meeting is on neither day.',
      'The meeting may be on Thursday or on neither day.',
    ],
    'The meeting is on exactly one of the two days, and it is not Monday, so it is Thursday. Neither day would abandon the stated choice.',
  ),
  deductionItem(
    16,
    ANSWER_PROMPT,
    'Jora is taller than Kim. Kim is taller than Lou. Lou is taller than Mo. Nia is taller than Jora. Who is the second tallest?',
    'Jora',
    ['Nia', 'Kim', 'Lou', 'Mo'],
    'From tallest to shortest the only order is Nia, Jora, Kim, Lou, Mo, so Jora is second. Nia is the tallest, which is the easy miscount.',
  ),
  deductionItem(
    17,
    MUST_PROMPT,
    'If a student passes the test or submits the essay, then the student passes the course. Sam did not pass the course.',
    'Sam neither passed the test nor submitted the essay.',
    [
      'Sam did not take the test.',
      'Sam submitted the essay and still failed the course.',
      'Sam failed the course only because of the essay.',
      'Sam may have passed the test without submitting the essay.',
    ],
    'If Sam had passed the test or submitted the essay, Sam would have passed the course. Sam did not pass, so Sam did neither; not taking the test is a stronger claim.',
  ),
  deductionItem(
    18,
    MUST_PROMPT,
    'The gate opens if and only if the code is correct. The gate did not open.',
    'The code was not correct.',
    [
      'The code was correct.',
      'The code was correct, but the gate failed.',
      'Some wrong codes open the gate.',
      'The gate opened later the same day.',
    ],
    'The gate opens exactly when the code is correct. It did not open, so the code was not correct; a later opening is not given.',
  ),
  deductionItem(
    19,
    ANSWER_PROMPT,
    'Ari, Bo, Cai and Dee each take a different role: cook, drive, paint or sing. Ari cooks. Bo does not drive. Cai sings. Dee does not paint. Who paints?',
    'Bo',
    ['Dee', 'Either Bo or Dee', 'Ari', 'It cannot be determined'],
    'Ari cooks and Cai sings, so drive and paint remain for Bo and Dee. Bo does not drive, so Bo paints and Dee drives.',
  ),
  deductionItem(
    20,
    MUST_PROMPT,
    'Everyone who volunteers on Saturday also volunteers on Sunday. Everyone who volunteers on Sunday receives a badge. Dana received no badge.',
    'Dana did not volunteer on Saturday.',
    [
      'Dana volunteered on Sunday but not on Saturday.',
      'Everyone who receives a badge volunteers on Saturday.',
      'Dana may still have volunteered on Saturday.',
      'Dana received a badge for Sunday work only.',
    ],
    'A Saturday volunteer would volunteer on Sunday and would receive a badge. Dana received no badge, so Dana did not volunteer on Sunday and therefore did not volunteer on Saturday.',
  ),
  deductionItem(
    21,
    MUST_PROMPT,
    'If it is a holiday, the office is closed. If the office is closed, the letters are not delivered. The letters were delivered today.',
    'It is not a holiday.',
    [
      'It is a holiday.',
      'The office is closed on every day that is not a holiday.',
      'The letters are delivered only on holidays.',
      'The letters were delivered because today is a holiday.',
    ],
    'Delivered letters mean the office is not closed, and an open office means today is not a holiday. The other claims reverse the rules or add a rule that was not stated.',
  ),
  deductionItem(
    22,
    MUST_PROMPT,
    'No philosophers are athletes. Some athletes are teachers.',
    'Some teachers are not philosophers.',
    [
      'Some philosophers are teachers.',
      'All teachers are athletes.',
      'No teachers are athletes.',
      'All philosophers are teachers.',
    ],
    'At least one athlete is a teacher, and no athlete is a philosopher, so that teacher is not a philosopher. Teachers need not all be athletes.',
  ),
  deductionItem(
    23,
    MUST_PROMPT,
    'All architects are planners. All planners are organizers. No organizers are improvisers.',
    'No architects are improvisers.',
    [
      'All organizers are architects.',
      'Some improvisers are planners.',
      'All improvisers are architects.',
      'Some architects are improvisers.',
    ],
    'Architects are planners, planners are organizers, and no organizer is an improviser, so no architect is an improviser. The chain does not run backwards from organizers to architects.',
  ),
  deductionItem(
    24,
    MUST_PROMPT,
    'Exactly two of these three statements are true. (1) Nico finished before Opal. (2) Opal finished before Pax. (3) Pax finished before Nico.',
    'More than one finishing order is consistent with the statements.',
    [
      'Nico finished before Opal.',
      'Opal finished before Pax.',
      'Pax finished before Nico.',
      'Nico finished first.',
    ],
    'Each pair of statements can be the true pair, giving three different orders: Nico-Opal-Pax, Opal-Pax-Nico, and Pax-Nico-Opal. No single order is required.',
  ),
  deductionItem(
    25,
    MUST_PROMPT,
    'Every badge-holder is a guide or a cook, or both. No cook is a guide. Every guide knows the password. Pat holds a badge and does not know the password.',
    'Pat is a cook.',
    [
      'Pat is a guide.',
      'Pat is both a guide and a cook.',
      'Whether Pat is a cook or a guide cannot be determined.',
      'Every cook who holds a badge knows the password.',
    ],
    'Pat does not know the password, so Pat is not a guide. A badge-holder who is not a guide must be a cook, and no cook is a guide, so the role is determined.',
  ),
  deductionItem(
    26,
    MUST_PROMPT,
    'All red tickets are free. All free tickets are for the front. No front ticket is for the balcony. Some tickets are red. Some balcony tickets are expensive.',
    'No red ticket is for the balcony.',
    [
      'All front tickets are red.',
      'Some balcony tickets are free.',
      'Every expensive ticket is for the front.',
      'All balcony tickets are expensive.',
    ],
    'Red tickets are free, free tickets are for the front, and no front ticket is for the balcony, so no red ticket is for the balcony. The expensive balcony tickets do not pull the red tickets back, and "some" does not become "all".',
  ),
];

function assertBank(items: readonly VerbalStem[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate verbal id ${item.id}.`);
    ids.add(item.id);
    if (item.options.length !== 5 || new Set(item.options).size !== 5) {
      throw new Error(`Verbal item ${item.id} needs five distinct options.`);
    }
    if (item.options.some((option) => option.trim() === '')) {
      throw new Error(`Verbal item ${item.id} has an empty option.`);
    }
    if (item.stimulus.trim() === '' || item.prompt.trim() === '' || item.explanation.trim() === '') {
      throw new Error(`Verbal item ${item.id} has empty text.`);
    }
  }
}

export const verbalBank: readonly VerbalStem[] = Object.freeze([
  ...analogies,
  ...oddOnes,
  ...similarities,
  ...vocabulary,
  ...deductions,
]);

assertBank(verbalBank);

function text(value: string): { type: 'text'; text: string } {
  return { type: 'text', text: value };
}

function toChoice(stemItem: VerbalStem, optionTexts: readonly string[], answer: number): ChoiceItem {
  return {
    id: stemItem.id,
    domain: 'verbal',
    kind: 'choice',
    b: stemItem.b,
    a: stemItem.a,
    family: stemItem.family,
    prompt: stemItem.prompt,
    explanation: stemItem.explanation,
    stimulus: text(stemItem.stimulus),
    options: optionTexts.map((value) => text(value)),
    answer,
  };
}

function nearestUnused(targetB: number, usedIds: ReadonlySet<string>): VerbalStem[] {
  const available = verbalBank.filter((item) => !usedIds.has(item.id));
  if (available.length === 0) return [];
  available.sort(
    (left, right) =>
      Math.abs(left.b - targetB) - Math.abs(right.b - targetB) || left.id.localeCompare(right.id),
  );
  return available.slice(0, Math.min(NEAREST_POOL, available.length));
}

export const verbalGenerator: ItemGenerator = {
  domain: 'verbal',

  generate(rng: Rng, targetB: number, usedIds: ReadonlySet<string>): ChoiceItem {
    const pool = nearestUnused(targetB, usedIds);
    // About 40% procedural when a generated family sits near the target; always, if the bank is exhausted.
    const useProcedural = proceduralNear(targetB) && (pool.length === 0 || rng.chance(0.4));
    if (useProcedural) {
      const procedural = tryProcedural(rng, targetB, usedIds);
      if (procedural) return procedural;
    }
    if (pool.length === 0) throw new Error('No unused verbal items remain.');
    // Pick before shuffling so one seed fixes both the stem and the option order.
    const chosen = rng.pick(pool);
    const optionTexts = rng.shuffle(chosen.options);
    const answer = optionTexts.indexOf(chosen.options[0]);
    if (answer < 0) throw new Error(`Correct option missing after shuffle for ${chosen.id}.`);
    return toChoice(chosen, optionTexts, answer);
  },

  practice(): ChoiceItem {
    return {
      id: 'vb-an-000',
      domain: 'verbal',
      kind: 'choice',
      b: -2.5,
      a: 1.4,
      family: 'vb-analogy',
      prompt: ANALOGY_PROMPT,
      explanation:
        'Cold is the opposite of hot, so the opposite of up is down. Sky is associated with up, but it is not the opposite.',
      stimulus: text('HOT : COLD :: UP : ?'),
      options: ['DOWN', 'SKY', 'HIGH', 'WARM', 'LEFT'].map((value) => text(value)),
      answer: 0,
    };
  },
};
