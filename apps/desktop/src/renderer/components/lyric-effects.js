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
  add("kiss kisses kissed kissing lips", "💋", "hot");
  add("crush adore desire passion sexy", "😍", "hot");
  add("baby babies", "🫶", "hot");
  add("smile smiles smiling happy happiness joy", "😊", "gold");
  add("laugh laughs laughing lol", "😂", "gold");
  add("sad sadness lonely loneliness", "😔", "ice");
  add("cry cries cried crying tears teardrop", "😢", "ice");
  add("mad angry anger rage furious", "😡", "fire");
  add("crazy insane psycho", "🤪", "violet");
  add("cool chill relaxed", "😎", "ice");
  add("shy blush blushing", "☺️", "hot");
  add("sick ill pain hurt hurting", "🤕", "ice");
  add("sleep sleeps sleeping sleepy", "😴", "violet");
  add("think thinks thinking thought thoughts mind brain", "🧠", "violet");
  add("pray prays praying prayer prayers", "🙏", "sky");
  add("promise promises promised swear", "🤞", "sky");
  add("friend friends friendship", "🤝", "sky");
  add("family families", "👨‍👩‍👧‍👦", "gold");
  add("girl girls woman women", "👩", "hot");
  add("boy boys man men", "👨", "sky");
  add("child children kid kids", "🧒", "gold");
  add("eyes eye look looks looking watch watching", "👀", "sky");
  add("face faces", "🙂", "gold");
  add("hand hands touch touches touching", "🤲", "hot");
  add("finger fingers point points pointing", "👉", "gold");
  add("tongue tongues taste tastes tasting", "👅", "hot");
  add("soul souls spirit spirits", "🕊️", "sky");

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

  add("money cash dollar dollars paid pay paycheck", "💸", "gold");
  add("rich richer richest wealth wealthy bag bags", "💰", "gold");
  add("coin coins gold golden", "🪙", "gold");
  add("diamond diamonds jewel jewels jewelry", "💎", "ice");
  add("bank banks", "🏦", "gold");
  add("card cards credit", "💳", "gold");
  add("shopping shop shops bought buy buying", "🛍️", "hot");
  add("gift gifts present presents", "🎁", "hot");

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

  add("phone phones call calls called calling text texts texting", "📱", "violet");
  add("camera cameras picture pictures photo photos", "📸", "sky");
  add("movie movies film films", "🎬", "violet");
  add("game games gaming play playing player players", "🎮", "violet");
  add("watch watches clock clocks time times", "⏳", "gold");
  add("book books read reads reading", "📖", "sky");
  add("write writes writing letter letters", "✍️", "sky");
  add("key keys locked lock locks unlock", "🔑", "gold");
  add("gun guns shoot shoots shooting shot shots", "🔫", "fire");
  add("knife knives blade blades", "🔪", "ice");
  add("bomb bombs", "💣", "fire");
  add("chain chains", "⛓️", "ice");
  add("police cop cops", "🚔", "sky");
  add("jail prison", "🔒", "ice");
  add("doctor doctors hospital", "🏥", "sky");
  add("pill pills medicine", "💊", "hot");
  add("weed marijuana", "🌿", "sky");

  add("drink drinks drinking drank bottle bottles", "🥂", "gold");
  add("wine wines", "🍷", "hot");
  add("beer beers", "🍺", "gold");
  add("coffee coffees", "☕", "gold");
  add("food foods eat eats eating ate", "🍽️", "gold");
  add("cake cakes birthday birthdays", "🎂", "hot");
  add("candy candies sweet sweets", "🍬", "hot");
  add("apple apples", "🍎", "hot");
  add("cherry cherries", "🍒", "hot");
  add("peach peaches", "🍑", "hot");

  add("dog dogs puppy puppies", "🐶", "gold");
  add("cat cats kitten kittens", "🐱", "violet");
  add("snake snakes", "🐍", "sky");
  add("goat goats", "🐐", "gold");
  add("lion lions", "🦁", "gold");
  add("tiger tigers", "🐯", "fire");
  add("wolf wolves", "🐺", "ice");
  add("bird birds", "🐦", "sky");
  add("butterfly butterflies", "🦋", "violet");

  add("win wins winner winners winning won", "🏆", "gold");
  add("goal goals score scores scored", "🥅", "sky");
  add("ball balls", "⚽", "sky");
  add("fight fights fighting fighter fighters", "🥊", "fire");
  add("strong stronger strongest power powerful", "💪", "fire");
  add("run runs ran running", "🏃", "fire");
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

  add("yes yep", "✅", "sky");
  add("nope wrong", "❌", "hot");
  add("stop stops stopped", "🛑", "fire");
  add("warning danger dangerous", "⚠️", "gold");
  add("question questions why", "❓", "violet");
  add("shit bullshit", "💩", "gold");
  add("clown clowns", "🤡", "hot");

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

  return { cleanWord, decorateRows, effectForWord, isHighlightCandidate, selectHighlights };
});
