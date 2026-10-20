import type { Domain } from './types';

export type ModeId = 'quick' | 'standard' | 'comprehensive';

export function questionTypeOf(item: { family?: string; domain: Domain }): QuestionType & { key: string } {
  const key = item.family && QUESTION_TYPES[item.family] ? item.family : `${item.domain}-other`;
  return { key, ...(QUESTION_TYPES[key] ?? { domain: item.domain, name: 'Other', measures: '' }) };
}

export interface SectionConfig {
  domain: Domain;
  items: number;
  seconds: number;
}

export interface ModeConfig {
  id: ModeId;
  label: string;
  minutes: number;
  summary: string;
  sections: SectionConfig[];
}

export interface DomainInfo {
  name: string;
  /** Index name used in the report, Wechsler-style. */
  index: string;
  short: string;
  description: string;
  /** Plain-language note on what a relative strength in this area tends to look like. */
  strength: string;
  weakness: string;
}

export const DOMAINS: Record<Domain, DomainInfo> = {
  matrices: {
    name: 'Matrix Reasoning',
    index: 'Fluid Reasoning',
    short: 'FRI',
    description:
      'Find the rule that governs a grid of abstract figures and apply it to complete the pattern. This is the classic measure of fluid intelligence — solving novel problems without relying on prior knowledge.',
    strength: 'You infer abstract rules quickly and hold several of them in mind at once, which helps with unfamiliar problems, systems thinking and learning new technical material.',
    weakness: 'Novel abstract problems took more effort than other areas. Working step by step — isolating one attribute at a time — is usually the most effective strategy.',
  },
  verbal: {
    name: 'Verbal Reasoning',
    index: 'Verbal Comprehension',
    short: 'VCI',
    description:
      'Analogies, similarities, word meaning and short logical deductions. Measures reasoning with language and the breadth of acquired verbal concepts (crystallised ability).',
    strength: 'You reason precisely with words and concepts, spot abstract relationships between ideas and draw valid conclusions from statements — assets for writing, argument and learning from text.',
    weakness: 'Verbal items were relatively harder for you. This area is the most influenced by education, reading habits and first language, so treat it with that context in mind.',
  },
  spatial: {
    name: 'Spatial Reasoning',
    index: 'Visual-Spatial',
    short: 'VSI',
    description:
      'Mentally rotate shapes, track a figure through a sequence of transformations and predict the result of folding paper. Measures the ability to build and manipulate mental images.',
    strength: 'You manipulate mental images accurately, which supports engineering, design, navigation, surgery, mathematics and many hands-on skills.',
    weakness: 'Mental rotation and transformation were relatively harder. Spatial skills respond well to practice (e.g. sketching, 3D puzzles, video games with spatial demands).',
  },
  series: {
    name: 'Quantitative Reasoning',
    index: 'Quantitative Reasoning',
    short: 'QRI',
    description:
      'Discover the rule behind number sequences and number grids. Measures inductive reasoning with quantities rather than arithmetic skill or memorised formulas.',
    strength: 'You detect numerical structure and relationships quickly — useful for data analysis, finance, programming and the quantitative sciences.',
    weakness: 'Number patterns were relatively harder. Writing out the differences between neighbouring terms is the most reliable first step on items like these.',
  },
  memory: {
    name: 'Working Memory',
    index: 'Working Memory',
    short: 'WMI',
    description:
      'Hold a sequence of digits or letters in mind and mentally rearrange it — reversing it or sorting it — before responding. Measures the capacity and control of short-term attention.',
    strength: 'You hold and manipulate information in mind well, which supports mental arithmetic, following complex instructions and multi-step reasoning.',
    weakness: 'Holding and rearranging sequences was relatively harder. Working memory is sensitive to fatigue, stress and distraction on the day, so this index can vary between sessions.',
  },
};

export interface QuestionType {
  domain: Domain;
  name: string;
  /** What the question type asks and the skill it leans on most. */
  measures: string;
}

/** Keyed by `Item.family`. Order here is the display order in the report. */
export const QUESTION_TYPES: Record<string, QuestionType> = {
  'mx-attribute': { domain: 'matrices', name: 'Attribute rules', measures: 'Spotting how shape, number, size, shading and orientation change across a row — core inductive reasoning.' },
  'mx-overlay': { domain: 'matrices', name: 'Overlay logic', measures: 'Combining or cancelling line patterns (add, keep differences, keep common parts) — rule abstraction with visual logic.' },
  'mx-composite': { domain: 'matrices', name: 'Multi-component patterns', measures: 'Tracking several independent rules at once in layered figures — the most demanding load on reasoning and working memory.' },
  'vb-analogy': { domain: 'verbal', name: 'Analogies', measures: 'Identifying the relationship between two concepts and applying it to a new pair.' },
  'vb-odd-one-out': { domain: 'verbal', name: 'Odd one out', measures: 'Finding the category that unites a group of words and the one that breaks it.' },
  'vb-similarity': { domain: 'verbal', name: 'Similarities', measures: 'Abstracting the essential property two different things share — verbal concept formation.' },
  'vb-vocabulary': { domain: 'verbal', name: 'Vocabulary', measures: 'Breadth and precision of word knowledge — the most education-dependent type.' },
  'vb-deduction': { domain: 'verbal', name: 'Logical deduction', measures: 'Drawing only the conclusions that strictly follow from given statements.' },
  'sp-rotation': { domain: 'spatial', name: 'Mental rotation', measures: 'Rotating a shape in your mind and telling it apart from its mirror image.' },
  'sp-transform': { domain: 'spatial', name: 'Transformation sequences', measures: 'Applying a series of rotations and flips to a figure in the correct order.' },
  'sp-folding': { domain: 'spatial', name: 'Paper folding', measures: 'Visualising how folds and punches map back onto an unfolded sheet.' },
  'ns-series': { domain: 'series', name: 'Number series', measures: 'Inducing the rule behind a sequence — differences, ratios, interleaving and recursion.' },
  'ns-matrix': { domain: 'series', name: 'Number grids', measures: 'Finding an arithmetic rule that holds across every row of a grid.' },
  'wm-backward': { domain: 'memory', name: 'Digits backward', measures: 'Holding a sequence and reversing it — span plus mental manipulation.' },
  'wm-sequencing': { domain: 'memory', name: 'Digit sequencing', measures: 'Holding a sequence and sorting it in your head.' },
  'wm-letterNumber': { domain: 'memory', name: 'Letter–number sequencing', measures: 'Holding a mixed sequence and reorganising it by two rules at once — the heaviest working-memory load.' },
};

export interface CareerCluster {
  title: string;
  roles: string[];
  why: string;
}

/** Fields that lean on each ability. Chosen from the person's relative strengths, never their overall level. */
export const CAREERS_BY_DOMAIN: Record<Domain, CareerCluster> = {
  matrices: { title: 'Novel problem-solving', roles: ['Research scientist', 'Strategy consultant', 'Software architect', 'Entrepreneur', 'Diagnostician'], why: 'Roles where the problems change constantly and there is no manual reward fast abstract reasoning.' },
  verbal: { title: 'Language and argument', roles: ['Lawyer', 'Writer or editor', 'Teacher', 'Policy analyst', 'Communications lead'], why: 'Roles built on explaining, persuading and reasoning with precise language.' },
  spatial: { title: 'Building and visualising', roles: ['Engineer', 'Architect', 'Surgeon', 'Product or industrial designer', '3D artist'], why: 'Spatial ability is one of the strongest predictors of success in engineering, design and technical trades.' },
  series: { title: 'Working with quantities', roles: ['Data analyst', 'Actuary', 'Financial analyst', 'Programmer', 'Economist'], why: 'Roles where spotting structure in numbers and data is the core of the job.' },
  memory: { title: 'Juggling information in real time', roles: ['Air traffic controller', 'Interpreter', 'Emergency physician', 'Pilot', 'Project manager'], why: 'Roles that demand holding and updating several pieces of information at once under time pressure.' },
};

/** Keyed by the two strongest domains, sorted alphabetically and joined with '+'. */
export const CAREERS_BY_PAIR: Record<string, CareerCluster> = {
  'matrices+memory': { title: 'Complex systems', roles: ['Software engineer', 'Systems analyst', 'Cybersecurity analyst', 'Logistics planner', 'Operations researcher'], why: 'Reasoning about unfamiliar rules while keeping many moving parts in mind is the daily work of building and debugging complex systems.' },
  'matrices+series': { title: 'Analytical research', roles: ['Data scientist', 'Quantitative analyst', 'Actuary', 'Economist', 'Research scientist'], why: 'Inducing hidden rules from data — the shared core of your two strongest areas — is what analytical and research roles are paid for.' },
  'matrices+spatial': { title: 'Engineering and design problem-solving', roles: ['Mechanical or civil engineer', 'Architect', 'Physicist', 'Product designer', 'Game designer'], why: 'Abstract reasoning plus strong mental imagery is the classic profile of people who invent and design physical and visual systems.' },
  'matrices+verbal': { title: 'Strategy, law and ideas', roles: ['Lawyer', 'Policy analyst', 'Management consultant', 'Academic researcher', 'Investigative journalist'], why: 'Turning complex, unfamiliar problems into clear arguments is the heart of law, policy and strategy work.' },
  'memory+series': { title: 'Precision with numbers', roles: ['Accountant or auditor', 'Financial analyst', 'Pharmacist', 'Trader', 'Statistician'], why: 'Holding figures in mind and spotting numerical patterns supports roles where accuracy with numbers matters most.' },
  'memory+spatial': { title: 'Real-time spatial work', roles: ['Pilot', 'Surgeon', 'Air traffic controller', 'Dentist', 'Film or video editor'], why: 'Tracking a changing 3D situation while keeping several details in mind is central to piloting, surgery and control-room work.' },
  'memory+verbal': { title: 'Language in real time', roles: ['Interpreter', 'Journalist', 'Trial lawyer', 'Teacher', 'Broadcaster'], why: 'Holding and reshaping language on the fly suits work where you must listen, think and speak at the same time.' },
  'series+spatial': { title: 'Technical engineering', roles: ['Electrical engineer', 'Robotics engineer', 'GIS or CAD specialist', 'Physicist', 'Structural engineer'], why: 'Quantitative reasoning combined with spatial visualisation is the profile most associated with engineering and the physical sciences.' },
  'series+verbal': { title: 'Explaining numbers', roles: ['Economist', 'Business analyst', 'Financial adviser', 'Science communicator', 'Technical writer'], why: 'Few people are strong with both numbers and words; roles that translate data into decisions reward exactly that.' },
  'spatial+verbal': { title: 'Visual communication and design', roles: ['UX designer', 'Architect', 'Urban planner', 'Industrial designer', 'Art director'], why: 'Visualising a solution and explaining it persuasively is the core of design and planning professions.' },
};

export const MODES: Record<ModeId, ModeConfig> = {
  quick: {
    id: 'quick',
    label: 'Quick',
    minutes: 20,
    summary: 'A short screening estimate across all five areas.',
    sections: [
      { domain: 'matrices', items: 8, seconds: 6 * 60 },
      { domain: 'verbal', items: 6, seconds: 3 * 60 },
      { domain: 'spatial', items: 6, seconds: 4 * 60 },
      { domain: 'series', items: 6, seconds: 4 * 60 },
      { domain: 'memory', items: 6, seconds: 3 * 60 },
    ],
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    minutes: 40,
    summary: 'Balanced precision and length. Recommended for most people.',
    sections: [
      { domain: 'matrices', items: 14, seconds: 12 * 60 },
      { domain: 'verbal', items: 10, seconds: 6 * 60 },
      { domain: 'spatial', items: 10, seconds: 8 * 60 },
      { domain: 'series', items: 10, seconds: 8 * 60 },
      { domain: 'memory', items: 10, seconds: 6 * 60 },
    ],
  },
  comprehensive: {
    id: 'comprehensive',
    label: 'Comprehensive',
    minutes: 60,
    summary: 'The most precise estimate, with reliable index scores for each area.',
    sections: [
      { domain: 'matrices', items: 20, seconds: 17 * 60 },
      { domain: 'verbal', items: 15, seconds: 9 * 60 },
      { domain: 'spatial', items: 14, seconds: 12 * 60 },
      { domain: 'series', items: 14, seconds: 12 * 60 },
      { domain: 'memory', items: 14, seconds: 10 * 60 },
    ],
  },
};

export function sectionsFor(mode: ModeId, nonverbal: boolean): SectionConfig[] {
  return MODES[mode].sections.filter((s) => !(nonverbal && s.domain === 'verbal'));
}

export function totalSeconds(sections: readonly SectionConfig[]): number {
  return sections.reduce((sum, s) => sum + s.seconds, 0);
}
