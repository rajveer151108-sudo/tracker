(function exposeLyricEffects(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LyricEffects = api;
})(typeof window !== "undefined" ? window : globalThis, function createLyricEffects() {
  const EFFECTS = Object.create(null);
  const TONES = ["hot", "fire", "ice", "gold", "sky", "violet"];

  function add(words, emoji, tone) {
    for (const word of words.split(/\s+/)) EFFECTS[word] = { emoji, tone };
  }

  // Curated around words that actually recur in songs. Synonyms and common
  // inflections are explicit so the same lyric always produces the same effect.
  add("love loves loved loving lover romance romantic heart hearts heartbeat", "❤️", "hot");
  add("heartbreak heartbroken broken breakup", "💔", "hot");
  add("kiss kisses kissed kissing lips", "💋", "hot");
  add("crush adore desire passion sexy beautiful gorgeous pretty", "😍", "hot");
  add("baby babies", "🫶", "hot");
  add("smile smiles smiling happy happiness joy", "😊", "gold");
  add("laugh laughs laughing lol", "😂", "gold");
  add("sad sadness lonely loneliness", "😔", "ice");
  add("cry cries cried crying tears teardrop", "😢", "ice");
  add("mad angry anger rage furious", "😡", "fire");
  add("crazy insane psycho", "🤪", "violet");
  add("scared afraid fear fears fearful", "😨", "violet");
  add("shock shocked shocking surprise surprised", "😱", "violet");
  add("nervous anxiety anxious worried worry", "😰", "ice");
  add("tired exhausted yawn yawning", "🥱", "violet");
  add("confused confusion", "😵‍💫", "violet");
  add("cool chill relaxed", "😎", "ice");
  add("shy blush blushing", "☺️", "hot");
  add("sick ill pain hurt hurting", "🤕", "ice");
  add("sleep sleeps sleeping sleepy", "😴", "violet");
  add("think thinks thinking thought thoughts mind brain", "🧠", "violet");
  add("pray prays praying prayer prayers", "🙏", "sky");
  add("promise promises promised swear", "🤞", "sky");
  add("truth true honest honesty", "💯", "sky");
  add("lie lies lied lying liar liars fake", "🤥", "violet");
  add("hello hi goodbye bye farewell", "👋", "gold");
  add("alone solo", "🥀", "ice");
  add("miss misses missed missing remember remembers remembered memory memories", "💭", "violet");
  add("friend friends friendship", "🤝", "sky");
  add("family families", "👨‍👩‍👧‍👦", "gold");
  add("girl girls woman women", "👩", "hot");
  add("boy boys man men", "👨", "sky");
  add("child children kid kids", "🧒", "gold");
  add("eyes eye look looks looking watch watching", "👀", "sky");
  add("face faces", "🙂", "gold");
  add("head heads", "🗣️", "sky");
  add("hair hairs", "💇", "hot");
  add("mouth mouths", "👄", "hot");
  add("ear ears hear hears heard hearing listen listens listening", "👂", "sky");
  add("nose noses smell smells", "👃", "gold");
  add("hand hands touch touches touching", "🤲", "hot");
  add("finger fingers point points pointing", "👉", "gold");
  add("tongue tongues taste tastes tasting", "👅", "hot");
  add("soul souls spirit spirits", "🕊️", "sky");
  add("body bodies skin", "🕺", "hot");
  add("breathe breath breathing lungs", "🫁", "sky");

  add("fire fires flame flames burn burns burned burning lit", "🔥", "fire");
  add("hot heat", "🥵", "fire");
  add("cold colder coldest freeze freezes frozen freezing", "❄️", "ice");
  add("ice icy", "🧊", "ice");
  add("spark sparks sparkle sparkling shine shines shining", "✨", "violet");
  add("light lights bright brighter brightest", "💡", "gold");
  add("dark darker darkness", "🌑", "violet");
  add("night nights midnight", "🌙", "violet");
  add("day days daytime morning mornings", "🌅", "gold");
  add("evening evenings sunset sunsets", "🌇", "hot");
  add("electric electricity lightning thunder", "⚡", "fire");
  add("boom explode explodes exploded explosion", "💥", "fire");
  add("smoke smokes smoking", "💨", "ice");
  add("dust dusty", "🌫️", "ice");

  add("money cash dollar dollars paid pay paycheck", "💸", "gold");
  add("rich richer richest wealth wealthy bag bags", "💰", "gold");
  add("coin coins gold golden", "🪙", "gold");
  add("diamond diamonds jewel jewels jewelry", "💎", "ice");
  add("bank banks", "🏦", "gold");
  add("card cards credit", "💳", "gold");
  add("shopping shop shops bought buy buying", "🛍️", "hot");
  add("gift gifts present presents", "🎁", "hot");
  add("work works worked working job jobs office", "💼", "gold");
  add("boss bosses business", "🧑‍💼", "gold");
  add("deal deals dealin", "🤝", "gold");

  add("king kings", "👑", "gold");
  add("queen queens", "👸", "gold");
  add("prince princess royal royalty", "🤴", "gold");
  add("angel angels heaven heavenly", "😇", "sky");
  add("devil devils demon demons evil", "😈", "violet");
  add("ghost ghosts haunted", "👻", "violet");
  add("dead death die dies died dying kill kills killed", "💀", "violet");
  add("blood bloody bleeding", "🩸", "hot");
  add("magic magical spell spells", "🪄", "violet");
  add("dream dreams dreamed dreaming fantasy", "💭", "violet");
  add("monster monsters", "👹", "fire");
  add("alien aliens", "👽", "sky");
  add("dragon dragons", "🐉", "fire");
  add("fairy fairies", "🧚", "violet");
  add("vampire vampires", "🧛", "violet");

  add("sun sunny sunshine", "☀️", "gold");
  add("moon moons moonlight", "🌙", "sky");
  add("star stars starlight", "⭐", "sky");
  add("world earth planet", "🌍", "sky");
  add("sky skies cloud clouds cloudy", "☁️", "sky");
  add("rain rains raining rainy storm storms stormy", "🌧️", "ice");
  add("snow snows snowing snowy", "🌨️", "ice");
  add("wind winds windy", "🌬️", "ice");
  add("rainbow rainbows", "🌈", "violet");
  add("ocean oceans sea seas wave waves", "🌊", "sky");
  add("water waters wet drop drops", "💧", "ice");
  add("flower flowers rose roses", "🌹", "hot");
  add("tree trees forest woods", "🌲", "sky");
  add("beach beaches", "🏖️", "gold");
  add("mountain mountains", "🏔️", "ice");
  add("desert deserts sand", "🏜️", "fire");
  add("island islands", "🏝️", "sky");
  add("summer summers", "🌴", "gold");
  add("winter winters", "☃️", "ice");
  add("spring springs", "🌸", "hot");
  add("autumn fallin", "🍂", "gold");

  add("car cars ride rides riding drive drives driving", "🏎️", "fire");
  add("truck trucks", "🛻", "fire");
  add("train trains", "🚆", "sky");
  add("plane planes airplane airplanes flight flights", "✈️", "sky");
  add("rocket rockets high higher highest", "🚀", "violet");
  add("fly flies flying", "🪽", "sky");
  add("boat boats ship ships", "⛵", "sky");
  add("road roads highway highways street streets", "🛣️", "gold");
  add("home homes house houses", "🏠", "gold");
  add("city cities", "🌃", "violet");
  add("club clubs nightclub", "🪩", "violet");
  add("hotel hotels", "🏨", "gold");
  add("church churches", "⛪", "sky");
  add("school schools college", "🎓", "sky");
  add("room rooms bedroom", "🚪", "violet");
  add("bed beds", "🛏️", "violet");
  add("door doors", "🚪", "gold");
  add("window windows", "🪟", "sky");
  add("map maps lost location", "🗺️", "sky");
  add("north south east west", "🧭", "gold");
  add("space universe galaxy galaxies", "🌌", "violet");

  add("music musical song songs melody melodies", "🎵", "violet");
  add("sing sings sang sung singing", "🎤", "violet");
  add("rap raps rapper rappers rapping", "🎙️", "fire");
  add("dance dances danced dancing", "💃", "hot");
  add("party parties partying celebrate celebration", "🎉", "hot");
  add("guitar guitars", "🎸", "fire");
  add("piano pianos keys", "🎹", "sky");
  add("drum drums beat beats rhythm", "🥁", "fire");
  add("headphones headphone", "🎧", "violet");
  add("stage stages show shows concert concerts", "🎭", "violet");
  add("dj remix mixtape", "🎛️", "violet");
  add("vinyl record records", "💿", "violet");

  add("phone phones call calls called calling text texts texting", "📱", "violet");
  add("camera cameras picture pictures photo photos", "📸", "sky");
  add("movie movies film films", "🎬", "violet");
  add("game games gaming play playing player players", "🎮", "violet");
  add("computer computers laptop laptops", "💻", "sky");
  add("internet online wifi", "🌐", "sky");
  add("email emails message messages", "💌", "hot");
  add("screen screens television tv", "📺", "violet");
  add("watch watches clock clocks time times", "⏳", "gold");
  add("book books read reads reading", "📖", "sky");
  add("write writes writing letter letters", "✍️", "sky");
  add("key keys locked lock locks unlock", "🔑", "gold");
  add("gun guns shoot shoots shooting shot shots", "🔫", "fire");
  add("knife knives blade blades", "🔪", "ice");
  add("bomb bombs", "💣", "fire");
  add("chain chains", "⛓️", "ice");
  add("ring rings", "💍", "ice");
  add("crown crowns", "👑", "gold");
  add("sword swords", "⚔️", "ice");
  add("shield shields protect protects protected", "🛡️", "sky");
  add("war wars battle battles", "⚔️", "fire");
  add("peace peaceful", "☮️", "sky");
  add("free freedom", "🕊️", "sky");
  add("police cop cops", "🚔", "sky");
  add("jail prison", "🔒", "ice");
  add("doctor doctors hospital", "🏥", "sky");
  add("pill pills medicine", "💊", "hot");
  add("weed marijuana", "🌿", "sky");
  add("drug drugs", "💊", "hot");
  add("syrup lean", "🥤", "violet");

  add("drink drinks drinking drank bottle bottles", "🥂", "gold");
  add("wine wines", "🍷", "hot");
  add("beer beers", "🍺", "gold");
  add("coffee coffees", "☕", "gold");
  add("drunk wasted", "🥴", "violet");
  add("food foods eat eats eating ate", "🍽️", "gold");
  add("cake cakes birthday birthdays", "🎂", "hot");
  add("candy candies sweet sweets", "🍬", "hot");
  add("apple apples", "🍎", "hot");
  add("cherry cherries", "🍒", "hot");
  add("peach peaches", "🍑", "hot");
  add("lemon lemons", "🍋", "gold");
  add("banana bananas", "🍌", "gold");
  add("pizza pizzas", "🍕", "hot");
  add("burger burgers", "🍔", "gold");

  add("dog dogs puppy puppies", "🐶", "gold");
  add("cat cats kitten kittens", "🐱", "violet");
  add("snake snakes", "🐍", "sky");
  add("goat goats", "🐐", "gold");
  add("lion lions", "🦁", "gold");
  add("tiger tigers", "🐯", "fire");
  add("wolf wolves", "🐺", "ice");
  add("bird birds", "🐦", "sky");
  add("butterfly butterflies", "🦋", "violet");
  add("fish fishes", "🐟", "sky");
  add("shark sharks", "🦈", "ice");
  add("horse horses", "🐎", "gold");
  add("bear bears", "🐻", "gold");
  add("rat rats mouse mice", "🐀", "violet");
  add("bee bees", "🐝", "gold");

  add("win wins winner winners winning won", "🏆", "gold");
  add("goal goals score scores scored", "🥅", "sky");
  add("ball balls", "⚽", "sky");
  add("basketball", "🏀", "fire");
  add("football", "🏈", "gold");
  add("baseball", "⚾", "sky");
  add("tennis", "🎾", "gold");
  add("fight fights fighting fighter fighters", "🥊", "fire");
  add("strong stronger strongest power powerful", "💪", "fire");
  add("run runs ran running", "🏃", "fire");
  add("walk walks walked walking", "🚶", "sky");
  add("jump jumps jumped jumping", "🤸", "fire");
  add("swim swims swam swimming", "🏊", "sky");
  add("fast faster fastest speed", "💨", "ice");
  add("up rise rises rising", "⬆️", "sky");
  add("down fall falls falling fell", "⬇️", "ice");

  add("red", "🔴", "hot");
  add("orange", "🟠", "fire");
  add("yellow", "🟡", "gold");
  add("green", "🟢", "sky");
  add("blue", "🔵", "ice");
  add("purple violet", "🟣", "violet");
  add("black", "⚫", "violet");
  add("white", "⚪", "sky");

  add("shirt shirts clothes clothing fashion", "👕", "sky");
  add("dress dresses", "👗", "hot");
  add("shoe shoes sneaker sneakers kicks", "👟", "gold");
  add("boot boots", "🥾", "gold");
  add("hat hats cap caps", "🧢", "sky");
  add("glasses shades", "🕶️", "violet");
  add("coat coats jacket jackets", "🧥", "ice");

  add("yes yep", "✅", "sky");
  add("nope wrong", "❌", "hot");
  add("stop stops stopped", "🛑", "fire");
  add("warning danger dangerous", "⚠️", "gold");
  add("question questions why", "❓", "violet");
  add("shit bullshit", "💩", "gold");
  add("clown clowns", "🤡", "hot");
  add("luck lucky", "🍀", "sky");
  add("perfect perfection", "💯", "fire");
  add("secret secrets", "🤫", "violet");
  add("silence silent quiet", "🤫", "ice");
  add("loud louder loudest noise", "🔊", "fire");

  // Articles, conjunctions, prepositions, pronouns, auxiliaries, particles,
  // determiners, quantifiers and common lyric ad-libs should never be accented.
  const FUNCTION_WORDS = new Set((
    "a an the and but or nor for yet so although though because since unless while whereas whether " +
    "about above across after against along among around as at before behind below beneath beside besides between beyond " +
    "by despite down during except from in inside into like near of off on onto opposite out outside over past per regarding " +
    "round through throughout till to toward towards under underneath until up upon via with within without " +
    "i me my mine myself we us our ours ourselves you your yours yourself yourselves he him his himself she her hers herself " +
    "it its itself they them their theirs themselves who whom whose which what whatever whoever this that these those " +
    "am is are was were be been being have has had having do does did doing can could may might must shall should will would " +
    "not no yes if then than there here where when how all any both each either enough every few fewer many more most much " +
    "neither none other several some such own same another only just even also too very really still already ever never " +
    "again once now well back away get gets got getting gonna wanna gotta let lets im ive id ill youre youve youll youd hes " +
    "shes were theyre theyve thats dont doesnt didnt cant couldnt wont wouldnt shouldnt aint isnt arent wasnt werent havent " +
    "hasnt hadnt yeah yea yep nah uh um oh ooh ah ayy ay yo hey huh hmm whoa woah la na da ba"
  ).split(/\s+/));

  // Words that commonly carry emotional weight in a lyric. This is not used
  // to alter the text; it only gives an expressive line more visual room when
  // its audio is also swelling.
  const POWER_WORDS = new Set((
    "adore afraid alone angel angels anger anxious battle bleed bleeding blood broken burn burning " +
    "cry cries cried crying danger dark darkness dead death desire devil die died dies dying dream dreams " +
    "fear fears fire flame flames freedom goodbye heaven heavenly heartbreak heartbroken hope joy kill killed " +
    "kiss lonely love loved lover magic pain passion peace pray prayer rage remember rise rising sad sadness " +
    "scream soul spirit strong stronger strongest tears thunder truth war wild win world"
  ).split(/\s+/));

  function cleanWord(text) {
    return String(text || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  }

  function stableScore(text) {
    let hash = 2166136261;
    for (const char of String(text)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return hash >>> 0;
  }

  function effectForWord(text) {
    return EFFECTS[cleanWord(text)] || null;
  }

  function expressionForText(text) {
    const words = String(text || "").split(/\s+/).map(cleanWord).filter(Boolean);
    if (!words.length) return 0;
    let power = 0, expressive = 0;
    for (const word of words) {
      if (POWER_WORDS.has(word)) power += 1;
      else if (EFFECTS[word]) expressive += 1;
    }
    const punctuation = /[!?]/.test(String(text)) ? 0.12 : 0;
    return Math.min(1, power * 0.34 + expressive * 0.08 + punctuation);
  }

  function isHighlightCandidate(text) {
    const key = cleanWord(text);
    return key.length > 2 && !FUNCTION_WORDS.has(key) && !/^\d+$/.test(key);
  }

  function selectHighlights(rows) {
    const selected = new Set();
    for (let start = 0; start < rows.length; start += 10) {
      const window = rows.slice(start, start + 10);
      const candidates = window
        .map((row, offset) => ({ index: start + offset, key: cleanWord(row.text) }))
        .filter(({ key }) => isHighlightCandidate(key))
        .sort((a, b) => stableScore(`${a.key}:${a.index}`) - stableScore(`${b.key}:${b.index}`));
      const target = Math.min(4, 2 + (stableScore(window.map((row) => row.text).join("|")) % 3));
      for (const candidate of candidates) {
        if (selected.size && [...selected].some((index) => Math.abs(index - candidate.index) < 2)) continue;
        selected.add(candidate.index);
        if ([...selected].filter((index) => index >= start && index < start + 10).length >= target) break;
      }
    }
    return selected;
  }

  function decorateRows(rows) {
    const highlighted = selectHighlights(rows);
    let lastEmoji = -4;
    let previousEmoji = null;
    return rows.map((row, index) => {
      const effect = effectForWord(row.text);
      const canShowEmoji = effect?.emoji && index - lastEmoji >= 4 && effect.emoji !== previousEmoji;
      const emoji = canShowEmoji ? effect.emoji : null;
      if (emoji) {
        lastEmoji = index;
        previousEmoji = emoji;
      }
      const tone = effect?.tone || TONES[stableScore(`${row.text}:${index}`) % TONES.length];
      return { ...row, emoji, tone: highlighted.has(index) ? tone : null };
    });
  }

  function decorateLines(rows) {
    let previousEmoji = null;
    return rows.map((row) => {
      const effects = String(row.text || "").split(/\s+/).map(effectForWord).filter(Boolean);
      const effect = effects.find((candidate) => candidate.emoji !== previousEmoji) || effects[0] || null;
      if (effect?.emoji) previousEmoji = effect.emoji;
      return { ...row, emoji: effect?.emoji || null, tone: effect?.tone || null, lineEmoji: !!effect?.emoji };
    });
  }

  return { cleanWord, decorateLines, decorateRows, effectForWord, expressionForText, isHighlightCandidate, selectHighlights };
});
