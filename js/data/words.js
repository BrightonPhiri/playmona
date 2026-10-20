/* ============================================================
   PLAYMORA — words.js
   Word dictionary + scramble words + categories + missing
   letters + mini crosswords. Classic script, global window.FF.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  /* Common English words (3–9 letters) used for word validation. */
  var DICT = ('act add age ago aid aim air all and ant any ape app arm art ask ate ' +
    'bad bag ban bar bat bay bed bee beg bet bid big bin bit bow box boy bud bug bun bus but buy ' +
    'cab cam can cap car cat cob cod cog cop cot cow cry cub cup cut ' +
    'dad dam day den dew did dig dim dip dog dot dry dub dug dye ' +
    'ear eat eel egg elk elm end era eve ewe eye ' +
    'fan far fat fax fed fee few fig fin fir fit fix fly foe fog for fox fry fun fur ' +
    'gag gap gas gel gem get gig gin gob god got gum gun gut gym ' +
    'had ham has hat hay hen her hid him hip his hit hog hop hot how hub hue hug hum hut ' +
    'ice icy ill imp ink inn ion ire irk its ivy ' +
    'jab jag jam jar jaw jay jet jig job jog jot joy jug ' +
    'keg key kid kin kit ' +
    'lab lad lag lap law lay led leg let lid lie lip lit log lot low ' +
    'mad man map mar mat max may men met mid mix mob mod mom mop mow mud mug ' +
    'nap net new nil nod nor now nun nut ' +
    'oak oar oat odd off oil old one orb ore our out owe owl own ' +
    'pad pal pan pap pat paw pay pea peg pen pep pet pie pig pin pit pod pop pot pro pry pub pug pun pup put ' +
    'rag ram ran rap rat raw ray red rib rid rig rim rip rob rod rot row rub rug run rut ' +
    'sac sad sag sap sat saw say sea see set sew she shy sin sip sir sit six ski sky sly sob sod son sow soy spa spy sty sue sum sun ' +
    'tab tag tan tap tar tax tea ten the tie tin tip toe ton too top tot tow toy try tub tug two ' +
    'urn use ' +
    'van vet via vie vow ' +
    'wad wag war was wax way web wed wet who why wig win wit woe wok won wow ' +
    'yak yam yap yes yet yew you ' +
    'zap zip zoo ' +
    'able acid acre aged aide ally also amid arch area army arts aunt auto away awry ' +
    'back bail bait bake bald ball band bang bank bare barn base bath bean bear beat been beef beer bell belt bend bent best bike bill bind bird bite blob blue blur boar boat body boil bold bolt bond bone book boom boot born boss both bowl brat brew brim brow bulb bulk bull bump burn bury bush busy ' +
    'cage cake calf call calm came camp cane cape card care cart case cash cast cave cell cent chap chat chef chew chin chip chop city clam clan claw clay clip clog club clue coal coat coil coin cold colt comb come cone cook cool cope copy cord core cork corn cost couch could coup crab crew crib crop crow cube cuff curb cure curl ' +
    'damp dare dark dart dash data date dawn dead deaf deal dear debt deck deed deer defy demo dent deny desk dial dice diet dime dine dirt dish disk dock does doll dome done door dose dove down doze drag draw drew drip drop drum duck duct dull dumb dump dusk dust duty ' +
    'each earn ease east easy echo edge edit else emit envy epic even ever evil exam exit ' +
    'face fact fade fail fair fall fame fang farm fast fate fawn fear feast feed feel fell felt fern fete file fill film find fine fire firm fish fist five flag flat flaw flee flew flip flit float flock flood floor flour flow flu fly foam foil fold folk fond font food fool foot ford fork form fort foul four fowl free fret frog from fuel full fund fury fuse ' +
    'gain gale game gang gate gave gaze gear gene gift gill girl give glad glow glue gnat goal goat goes gold golf gone good gore gown grab gray grew grid grim grin grip grow gull gust ' +
    'hail hair half hall halt hand hang hard hare harm harp hate haul have hawk haze head heal heap hear heat heel held hell helm help herb herd here hero hide high hike hill hind hint hire hold hole holy home hook hope horn hose host hour howl huge hull hump hunt hurl hurt hush ' +
    'iced idea idle inch into iron isle item ' +
    'jack jail jazz jeep jest join joke jolt jury just ' +
    'keen keep kept kick kill kiln kind king kiss kite knee knew knit knob knot know ' +
    'lace lack lady laid lake lamb lame lamp land lane lark last late lava lawn lazy lead leaf leak lean leap left lend lens less life lift like limb lime limp line link lint lion list live load loaf loan lock loft lone long look loop lord lose loss lost loud love luck lump lung lure lush ' +
    'made maid mail main make male mall malt mane many mare mark mask mass mast mate maze meal mean meat meek meet melt mend menu mere mesh mess mild mile milk mill mind mine mint miss mist moan mob mode mold mole monk mood moon moor more moss most moth move much mule muse must mute myth ' +
    'nail name navy near neat neck need nest news next nice nick nine node none noon norm nose note noun numb ' +
    'oath obey oats obey odor okay omen once only onto open oral oven over ' +
    'pace pack page paid pail pain pair pale palm pane pant park part pass past path pave pawn peak pear peat peck peek peer pelt pend perch pest pick pier pike pile pill pine pink pint pipe pity plan play plea plot plow plug plum plus poem poet poke pole pond pony pool poor pork port pose post pour pray prey prop pull pulp pump pure push ' +
    'quit quiz ' +
    'race rack raft rage raid rail rain rake ramp rang rank rare rash rate rave read real reap rear reed reef reel rely rent rest rice rich ride rift ring ripe rise risk road roam roar robe rock rode role roll roof room root rope rose rosy rout rove ruby rude ruff ruin rule rung rush rust ' +
    'sack safe sage said sail sake sale salt same sand sang sank save scar seal seam seat seed seek seem seen self sell semi send sent shed ship shoe shop shot show shut sick side sigh sign silk sill sing sink site size skew skip slab slam slap sled slid slim slip slot slow slug slum snap snip snow soak soap soar sock soda soft soil sold sole some song soon sore sort soul soup sour span spar spin spit spot spur stab stag star stay stem step stew stir stop stub stud stun such suds suit sung sunk sure surf swan swam swap sway swim ' +
    'tack tail take tale talk tall tame tank tape task taxi teal team tear tell tend tent term test text than that thaw them then they thin this thus tick tide tidy tie tile till tilt time tint tiny tire toad told toll tomb tone took tool torn toss tour town trap tray tree trim trio trip trot true tuba tube tuck tuna tune turf turn tusk twin type ' +
    'ugly undo unit upon urge used user ' +
    'vain vase vast veal vent verb very vest veto vial vice view vine vote ' +
    'wade wage wait wake walk wall wand want ward warm warn warp wart wash wasp wave wavy wax weak wear weed week weep weld well went were west what when whey whim whip whoa whom why wide wife wild will wilt wind wine wing wink wipe wire wise wish with woke wolf wood wool word wore work worm worn wrap wren ' +
    'yank yard yarn yawn year yell yolk your ' +
    'zero zest zinc zone zoom ' +
    'about above abuse actor adapt admit adopt adore adult again agent agree ahead aisle alarm album alert alike alive alley allow alone along aloud altar alter amber amend among ample angel anger angle angry ankle annoy apart apple apply apron arena argue arise armor aroma array arrow aside asset atlas attic audit avoid awake award aware awful ' +
    'bacon badge baker balmy banjo barge basic basil batch beach beads beard beast began begin being belly bench berry birth black blade blame bland blank blast blaze bleak blend bless blind blink bliss block bloom blown bluff blunt blush board boast bonus boost booth bound brace brain brake brand brave bread break breed brick bride brief bring brink brisk broad brook broom broth brown brush brute buddy build built bunch bunny burst ' +
    'cabin cable camel candy canoe cargo carry carve catch cause cease cedar chair chalk charm chart chase cheap cheat check cheer chess chest chick chief child chill chime choir choke chord chose chunk cider cigar cinch civic civil claim clash clasp class clean clear clerk click cliff climb cling cloak clock close cloth cloud clove clown coach coast cocoa color comet comic coral couch could count court cover crack craft cramp crane crash crate crawl crazy cream creek creep crept crest crime crisp cross crowd crown crude cruel crumb crush crust curve cycle ' +
    'dairy dance dandy dealt death debit decay decor delay delta dense depth derby devil diary digit dirty ditch diver dizzy dodge doing donor doubt dough dozen draft drain drama drank drape drawn dread dream dress drift drill drink drive drone drove drown drum dry dusk dusty dwell ' +
    'eager eagle early earth easel eaten eater ebony eight elbow elder elect elite email ember empty enact enjoy enter entry equal equip erase error erupt essay event every exact excel exert exile exist extra ' +
    'fable faint fairy faith false fancy fatal fault favor feast fence ferry fetch fever fiber field fiery fifth fifty fight final finch first flair flame flash fleet flesh flick flint float flock flood floor flour flown fluid flute focus foggy force forge forgo forth forty forum found foyer frame fraud fresh fried front frost frown fruit fully fudge ' +
    'gauge geese genie genre ghost giant given glade gland glare glass gleam glide globe gloom glory glove going goose grace grade grain grand grant grape grasp grass grave graze great greed green greet grief grill grime grind groan groom gross group grove growl grown guard guess guest guide guild guilt gully gusto ' +
    'habit hairy handy happy hardy harsh haste hatch haunt haven hazel heard heart heavy hedge hefty hello hence herbs heron hilly hinge hippo hobby hoist holdy honey honor horde horse hotel hound house hover human humid humor hurry hutch ' +
    'ideal image imply inbox incur index infer inlet inner input inset irony issue ivory ' +
    'jelly jewel joint jolly judge juice jumbo ' +
    'kayak khaki kneel knock known ' +
    'label labor laden lance large laser latch later latte laugh layer learn lease least leave ledge legal lemon level lever light lilac limit linen liver llama local lodge lofty logic loose loyal lunar lunch lyric ' +
    'macro magic maize major mango maple march marsh match maybe mayor meadow medal media melon mercy merge merit merry metal meter midst might mimic miner minor minus mirth misty mocha model modem moist molar money month moose moral mossy motor mound mount mourn mouse mouth mover movie mower muddy mulch mural music musty ' +
    'naive nasal nasty naval needy nerve never newly night noble noisy north notch noted novel nurse ' +
    'oasis occur ocean offer often olive onion onset opera orbit order organ other otter ought ounce outer owner ' +
    'paint panda panel panic pansy paper parka party pasta paste patch patio pause peace peach pedal peek peer penny perch piano piece pilot pinch pitch pivot pixel pizza place plain plane plank plant plate plaza plead pluck plume plump plush point polar porch pouch pound power press price pride prime print prior prism prize probe prone proof proud prove prune pulse punch pupil puppy purse ' +
    'quack quail quart queen query quest quick quiet quill quilt quirk quote ' +
    'rabid radar radio raise rally ranch range rapid razor reach react ready realm rebel recap refer regal reign relax relay relic remix renew repay reply reset resin retro rhyme rider ridge rifle right rigid rinse ripen risen risky rival river roast robin robot rocky rogue roman roost rotor rouge rough round route rover rowdy royal rugby ruler rumor rural rusty ' +
    'sadly safer salad salon salsa salty sandy sauce sauna savor scale scalp scare scarf scene scent scoop scope score scout scrap scrub sedan seize sense serve seven shade shady shaft shake shale shall shame shape share shark sharp shave shear sheep sheer sheet shelf shell shift shine shiny shirt shock shore short shout shove shown shrub shrug sight silly since siren sixth sixty skate skill skirt skull slate sleek sleep sleet slice slide slime sling slope sloth small smart smash smell smile smith smoke snack snail snake sneak snore snowy soapy sober socks solar solid solve sonar sonic sorry sound south space spade spare spark spawn speak spear speed spell spend spent spice spike spine spiny spoke spoon sport spout spray spree spring sprout squad squid stack staff stage stain stair stake stale stalk stall stamp stand stare start state stave steak steam steel steep steer stern stick stiff still sting stock stole stone stood stool store storm story stout stove strap straw stray strip strum stuck study stuff stump stung stunt style suave sugar suite sunny super surge swamp swarm swear sweat sweep sweet swell swept swift swill swing swirl swoop sword swore ' +
    'table tacit tally tango taper tapir tardy taste tasty taunt teach teary tease teeth tempo tempt tenor tense tenth tepee terse thank theft their theme there these thick thief thigh thing think third thorn those three threw throb throw thumb thump tiger tight timer timid tipsy tired title toast today token tooth topic torch total touch tough towel tower toxic trace track trade trail train trait tramp trash tread treat trend trial tribe trick tried trim trip trope trout truce truck truly trunk trust truth tulip tumor tuner tutor twang tweak tweed tweet twice twine twist ' +
    'udder ulcer ultra uncle under unfit union unite unity until upper upset urban usage usher usual utter ' +
    'vague valid value valve vapor vault vegan venom venue verge verse video vigil vigor vinyl viola viper viral virus visit vista vital vivid vocal vodka voice voter vouch vowel ' +
    'wacky wafer wagon waist waive walker watch water weary weave wedge weigh weird whale wharf wheat wheel where while whine whirl whisk white whole whose widen width wield wince windy witch witty woken woman women world worry worse worst worth would wound woven wrath wrist write wrong wrote ' +
    'yacht yield young youth ' +
    'zebra ' +
    'abandon ability absence academy achieve acquire actress adaptor address admired advance advisor airport already amazing ambient angered annual apparel apricot archive arrange arrival article ashamed aspirin athlete attempt attract auction autumn average avocado awesome ' +
    'balance balcony balloon bamboo bargain barrier battery bearing beauty because bedroom bedtime believe benefit between blanket blossom booklet bothers bowling bracelets bravery breathe brewery brigade brighten brittle brother brought budget builder bundled butters ' +
    'cabbage cabinet calcite calorie camelot cameras candies captain capture careful carnival carried carrots cartoon cascade castles catalog catcher caution central century certain chamber channel chapter charity cheaper cheered cherish chicken chimney choices choosy chronic chunkier circuit circus citizen classic cleaner clearly climate climbed clinch closet clothes cluster coasted coconut college comfort compass compete complex concert confess connect contain content control convert cooking cookies copper correct cottage counter country courage cousin covered crayons create creative creature cricket crooked crowded crystal curious curtain cushion customs ' +
    'dancing darling daytime deceive decided declare decorate degrees delight dentist deposit deserve desktop dessert destiny details detour diamond differ digital dinner diploma dirtier discuss disease display distant dolphin doorway double dragon drawer drawing dreamt dressed driver durante dustbin ' +
    'earthen eastern eclipse economy educate elastic elderly elegant element embassy emperor empower enchant endless enforce engaged enhance enjoyer enquire entirely envelop episode equator essence evening example exceed exchange excited exclude exhibit explain explore express extinct extreme ' +
    'factory failure fairies families fantasy fashion feather feature feeling ferrari festive fiction fifteen fighter finally fingers finished firefly fishing fitting fixture flaming flamingo flavor fleeing flicker flowers flutter football forever forgave formula fortune forward founded fragile freedom freezer freight frequent friday friends frighten frisbee frontier frosting frozen fruitcake ' +
    'gallery gamble garbage garment gateway gather general genesis gentler geology gestured giraffe glacier glimmer glimpse glitter goggles gorilla grabbed grammar granite gravity greats greedy greeting griffin grocery ground guardian guessed guitar gumball ' +
    'habitat halfway hamburger hamster handbag hanging happily harbor harmony harvest heading healthy helpful herself highway history holiday honesty honored hopeful horizon hospital hosting however hundred hungry hurried husband ' +
    'iceberg icebergs imagine immense include indoors inertia inherit initial inquiry insects insight inspire instead integer intense interest interim internet invest invite inward island isolate ' +
    'jacket jaguar jingle journey joyful jungle junior justice ' +
    'kangaroo keeper kettle kidney kindest kingdom kitchen kitten knights ' +
    'lantern largely lasting laundry leading learned leather lecture legible leisure lending leopard lettuce liberty library license limited liquids lobster locally located lollipop longer loudly luggage lumber ' +
    'machine magical magnet majesty manager mangoes mansion marble margin market massage match matter meadow measure mechanic medical meeting melody member memory mention mermaid message meteor method middle midnight million mineral minutes miracle mirror missile mistake mixture modern moment monkey monthly morning mosque mother motion mountain movement mudroom muffin muscle museum mustard mystery ' +
    'natural natures naughty nectar neither nervous network neutral nibling nighty noodles normal northern notable nothing noticed nowhere numbers nursery ' +
    'oatmeal observe obvious octagon octopus offered officer online opening opinion optical orchard ordered organic ostrich outdoor outside overall overlap overtime ' +
    'package pajamas pancake panther parade parents parking parrot partial partner passage passion pasture patient pattern payment peaceful peanut pebble pelican pencil penguin people pepper perfect perform perfume perhaps persona physics pickaxe picnic picture pierce pigeon pillow pilot pirate pistachio pitcher pizza planet plastic plateau playful plumber pocket poetry pointed poison police polish polite ponder popcorn popular portion potato powder prairie praise prayer prefer prepare present pretend pretty preview princess printer private problem produce program promise protect protein provide public pumpkin puppet purple purpose pursuit puzzle ' +
    'quality quarter quickly quietly quiver ' +
    'rabbit racer radar radio raisins random ranger rapid rather rattle reader really reason recipe record reduce reeds reflect refresh regard region regret relate relax relief remain remark remedy remote repair repeat replay report rescue resist resort result retain retire return reveal review reward ribbon richer riddle ripple river roadblock roadside roaring robin rocket roller rooster rotate rounded routine rubber rugged running ' +
    'saddle safari safety sailor salad salmon sample sandals sandwich satellite sausage saving saying scarce scatter scenic school science scissors scooter score scramble scratch screen scribble search season second secret section seeing select seldom selfish senior sensor series serious service settle several shadow shallow shelter sheriff shield shining shipping shirts shoehorn should shoulder shower shrimp sibling signal silent silver simple singer single sister sketchy skillet skinny slipper slowly smooth soccer socket sodium soften soldier solving someone somehow somersault soothing sorrow sorting soulful souvenir speaker special spider spinach spirit splash splinter sponge sports spring sprinkle sprint square squash squeak squeeze squirrel stadium stages stairs staple starfish starting station statue steady steam steeple sterling sticky stomach storage stories stormy straight strange stream street strength stress stretch strike string stripe strong struggle student studio stumble sturdy subject succeed success sudden suffer sugar suggest summer summit sundae Sunday sunset super supper supply support suppose surface surprise surround suspect suspend sweater swimmer swing symbol system ' +
    'tablet tackle talent target taste teacher teddy temper temple tender tennis terror thank theme theory thick thief think thirsty thirteen thirty thread throat throne thunder ticket tidier tiger timber tissue title today toffee toilet tomato tongue tonight tootbrush tooth topic tornado tortoise total touch toward towel tower track tractor trade traffic tragic trail train traitor trampoline transfer travel treasure treat tree tremendous triangle trick trickle tricky trip triumph trolley trouble trousers truck trumpet trunk trust truth tsunami tulip tumble tunnel turtle twelve twenty twice twilight twinkle ' +
    'umbrella unhappy uniform unique universe unknown unload unpack untie upside upward urgent useful ' +
    'vacation valley vanish velvet vendor victory video village violin vision visit visitor vitamin volcano volume voyage ' +
    'waffle wagon waist wallet walnut wander warrior watch water waterfall watermelon weather weekend weight welcome western whale wheat wheel whisper whistle white whole window windy winter wisdom witch witness wizard wonder wooden word work workshop world worry worth wound write writer ' +
    'yacht year yellow yesterday yogurt young youth ' +
    'zebra zigzag zipper zombie zone zoom').split(' ');

  FF.data.words = {
    dictionary: DICT,

    scramble: [
      { word: 'computer', clue: 'A machine you type and browse on', difficulty: 'normal' },
      { word: 'elephant', clue: 'A huge animal with a trunk', difficulty: 'easy' },
      { word: 'giraffe', clue: 'The tallest animal with a long neck', difficulty: 'easy' },
      { word: 'banana', clue: 'A long yellow fruit', difficulty: 'easy' },
      { word: 'tiger', clue: 'A big striped cat', difficulty: 'easy' },
      { word: 'penguin', clue: 'A bird that cannot fly but swims', difficulty: 'normal' },
      { word: 'dolphin', clue: 'A friendly sea mammal', difficulty: 'normal' },
      { word: 'umbrella', clue: 'You open it when it rains', difficulty: 'normal' },
      { word: 'sandwich', clue: 'Food between two slices of bread', difficulty: 'normal' },
      { word: 'bicycle', clue: 'A two-wheeled ride', difficulty: 'easy' },
      { word: 'volcano', clue: 'A mountain that erupts', difficulty: 'normal' },
      { word: 'crocodile', clue: 'A big reptile in rivers', difficulty: 'hard' },
      { word: 'kangaroo', clue: 'An animal that hops with a pouch', difficulty: 'normal' },
      { word: 'octopus', clue: 'A sea animal with eight arms', difficulty: 'normal' },
      { word: 'butterfly', clue: 'A pretty insect with colourful wings', difficulty: 'normal' },
      { word: 'strawberry', clue: 'A red fruit with tiny seeds', difficulty: 'normal' },
      { word: 'chocolate', clue: 'A sweet brown treat', difficulty: 'easy' },
      { word: 'mountain', clue: 'A very tall landform', difficulty: 'easy' },
      { word: 'pyramid', clue: 'An ancient triangular tomb', difficulty: 'normal' },
      { word: 'dinosaur', clue: 'A giant animal from long ago', difficulty: 'normal' },
      { word: 'helicopter', clue: 'It flies with spinning blades', difficulty: 'hard' },
      { word: 'telephone', clue: 'You talk to people far away with it', difficulty: 'normal' },
      { word: 'rainbow', clue: 'Colours in the sky after rain', difficulty: 'easy' },
      { word: 'zebra', clue: 'A horse with stripes', difficulty: 'easy' },
      { word: 'whale', clue: 'The largest animal in the ocean', difficulty: 'easy' },
      { word: 'cactus', clue: 'A spiky desert plant', difficulty: 'normal' },
      { word: 'rocket', clue: 'It travels into space', difficulty: 'easy' },
      { word: 'candle', clue: 'It gives light with a flame', difficulty: 'easy' },
      { word: 'mirror', clue: 'You see your reflection in it', difficulty: 'easy' },
      { word: 'blanket', clue: 'Keeps you warm in bed', difficulty: 'easy' },
      { word: 'telescope', clue: 'You use it to see the stars', difficulty: 'hard' },
      { word: 'fireworks', clue: 'Colourful explosions in the sky', difficulty: 'normal' },
      { word: 'skeleton', clue: 'The bones in your body', difficulty: 'normal' },
      { word: 'lighthouse', clue: 'A tower that guides ships', difficulty: 'hard' },
      { word: 'detective', clue: 'A person who solves crimes', difficulty: 'hard' },
      { word: 'adventure', clue: 'An exciting journey', difficulty: 'normal' },
      { word: 'champion', clue: 'The winner of a contest', difficulty: 'normal' },
      { word: 'carnival', clue: 'A fun fair with rides', difficulty: 'hard' },
      { word: 'orchestra', clue: 'A large group of musicians', difficulty: 'hard' },
      { word: 'spaghetti', clue: 'Long thin pasta', difficulty: 'normal' },
      { word: 'pancake', clue: 'A flat breakfast cake', difficulty: 'easy' },
      { word: 'castle', clue: 'A home for kings and queens', difficulty: 'easy' },
      { word: 'pencil', clue: 'You write with it', difficulty: 'easy' },
      { word: 'garden', clue: 'A place where flowers grow', difficulty: 'easy' },
      { word: 'kitchen', clue: 'The room where you cook', difficulty: 'easy' },
      { word: 'airport', clue: 'Places where planes land', difficulty: 'normal' },
      { word: 'hospital', clue: 'A place where doctors work', difficulty: 'normal' },
      { word: 'library', clue: 'A place full of books', difficulty: 'normal' },
      { word: 'weather', clue: 'Sun, rain, wind and snow', difficulty: 'easy' },
      { word: 'language', clue: 'The words people speak', difficulty: 'normal' },
      { word: 'courage', clue: 'Being brave', difficulty: 'normal' },
      { word: 'friendship', clue: 'A special bond between people', difficulty: 'hard' },
      { word: 'celebrate', clue: 'To have a party', difficulty: 'hard' },
      { word: 'diamond', clue: 'A precious shiny stone', difficulty: 'normal' },
      { word: 'tornado', clue: 'A spinning storm', difficulty: 'hard' },
      { word: 'island', clue: 'Land surrounded by water', difficulty: 'easy' },
      { word: 'desert', clue: 'A hot dry place with sand', difficulty: 'easy' },
      { word: 'jungle', clue: 'A dense tropical forest', difficulty: 'normal' },
      { word: 'parrot', clue: 'A colourful bird that can talk', difficulty: 'easy' },
      { word: 'avocado', clue: 'A green creamy fruit', difficulty: 'normal' }
    ],

    categories: [
      { category: 'Animals', items: ['dog', 'cat', 'lion', 'tiger', 'elephant', 'giraffe', 'zebra', 'monkey', 'rabbit', 'horse', 'cow', 'sheep', 'goat', 'frog', 'snake', 'penguin'], difficulty: 'easy' },
      { category: 'Fruits', items: ['apple', 'banana', 'orange', 'grape', 'mango', 'watermelon', 'pineapple', 'strawberry', 'peach', 'pear', 'lemon', 'avocado'], difficulty: 'easy' },
      { category: 'Vegetables', items: ['carrot', 'potato', 'tomato', 'onion', 'pepper', 'cabbage', 'broccoli', 'corn', 'peas', 'beans', 'pumpkin', 'spinach'], difficulty: 'normal' },
      { category: 'Countries', items: ['Zimbabwe', 'South Africa', 'Nigeria', 'Egypt', 'Kenya', 'France', 'Japan', 'Brazil', 'India', 'Canada', 'Australia', 'Mexico'], difficulty: 'normal' },
      { category: 'Sports', items: ['football', 'basketball', 'tennis', 'cricket', 'rugby', 'swimming', 'golf', 'boxing', 'cycling', 'hockey', 'volleyball', 'athletics'], difficulty: 'normal' },
      { category: 'Jobs', items: ['doctor', 'teacher', 'farmer', 'pilot', 'chef', 'nurse', 'firefighter', 'police officer', 'engineer', 'artist', 'scientist', 'builder'], difficulty: 'easy' },
      { category: 'Things in a Kitchen', items: ['knife', 'fork', 'spoon', 'plate', 'cup', 'pan', 'pot', 'oven', 'fridge', 'kettle', 'bowl', 'ladle'], difficulty: 'normal' },
      { category: 'Things at School', items: ['pencil', 'book', 'desk', 'chair', 'ruler', 'eraser', 'backpack', 'teacher', 'chalkboard', 'notebook', 'globe', 'computer'], difficulty: 'easy' },
      { category: 'Colours', items: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'brown', 'grey', 'gold'], difficulty: 'easy' },
      { category: 'Transport', items: ['car', 'bus', 'train', 'airplane', 'bicycle', 'motorcycle', 'boat', 'ship', 'helicopter', 'truck', 'submarine', 'rocket'], difficulty: 'easy' },
      { category: 'Weather', items: ['rain', 'snow', 'wind', 'sun', 'cloud', 'storm', 'thunder', 'lightning', 'fog', 'hail', 'rainbow', 'tornado'], difficulty: 'normal' },
      { category: 'Clothes', items: ['shirt', 'pants', 'dress', 'shoes', 'socks', 'hat', 'coat', 'scarf', 'gloves', 'skirt', 'sweater', 'jacket'], difficulty: 'easy' },
      { category: 'Insects', items: ['bee', 'ant', 'butterfly', 'spider', 'ladybug', 'beetle', 'mosquito', 'dragonfly', 'caterpillar', 'grasshopper', 'wasp', 'fly'], difficulty: 'normal' },
      { category: 'Birds', items: ['eagle', 'owl', 'parrot', 'penguin', 'sparrow', 'flamingo', 'peacock', 'pigeon', 'crow', 'swan', 'duck', 'ostrich'], difficulty: 'normal' },
      { category: 'Sea Creatures', items: ['shark', 'whale', 'dolphin', 'octopus', 'starfish', 'crab', 'lobster', 'jellyfish', 'seahorse', 'turtle', 'squid', 'clownfish'], difficulty: 'normal' },
      { category: 'Musical Instruments', items: ['guitar', 'piano', 'drum', 'violin', 'flute', 'trumpet', 'saxophone', 'harp', 'cello', 'keyboard', 'tambourine', 'maracas'], difficulty: 'hard' }
    ],

    missingLetters: [
      { word: 'elephant', hint: 'A big grey animal with a trunk', difficulty: 'easy' },
      { word: 'giraffe', hint: 'A tall animal with a long neck', difficulty: 'easy' },
      { word: 'banana', hint: 'A yellow fruit monkeys love', difficulty: 'easy' },
      { word: 'penguin', hint: 'A black and white bird that swims', difficulty: 'normal' },
      { word: 'dolphin', hint: 'A smart sea animal', difficulty: 'normal' },
      { word: 'umbrella', hint: 'Keeps you dry in the rain', difficulty: 'normal' },
      { word: 'sandwich', hint: 'Lunch between bread', difficulty: 'normal' },
      { word: 'bicycle', hint: 'Two wheels and pedals', difficulty: 'easy' },
      { word: 'volcano', hint: 'It erupts with lava', difficulty: 'normal' },
      { word: 'octopus', hint: 'Eight arms in the sea', difficulty: 'normal' },
      { word: 'butterfly', hint: 'A colourful flying insect', difficulty: 'normal' },
      { word: 'chocolate', hint: 'A sweet brown treat', difficulty: 'easy' },
      { word: 'mountain', hint: 'A very high place', difficulty: 'easy' },
      { word: 'pyramid', hint: 'An ancient Egyptian tomb', difficulty: 'normal' },
      { word: 'dinosaur', hint: 'A giant extinct reptile', difficulty: 'normal' },
      { word: 'rainbow', hint: 'Seven colours in the sky', difficulty: 'easy' },
      { word: 'zebra', hint: 'A striped horse', difficulty: 'easy' },
      { word: 'rocket', hint: 'Goes up into space', difficulty: 'easy' },
      { word: 'candle', hint: 'Gives light with a flame', difficulty: 'easy' },
      { word: 'mirror', hint: 'Shows your reflection', difficulty: 'easy' },
      { word: 'blanket', hint: 'Keeps you warm in bed', difficulty: 'easy' },
      { word: 'skeleton', hint: 'All the bones in your body', difficulty: 'normal' },
      { word: 'champion', hint: 'The winner', difficulty: 'normal' },
      { word: 'spaghetti', hint: 'Long thin pasta', difficulty: 'normal' },
      { word: 'pancake', hint: 'A flat breakfast treat', difficulty: 'easy' },
      { word: 'castle', hint: 'Kings and queens live here', difficulty: 'easy' },
      { word: 'kitchen', hint: 'The cooking room', difficulty: 'easy' },
      { word: 'airport', hint: 'Where planes take off', difficulty: 'normal' },
      { word: 'hospital', hint: 'Where you see doctors', difficulty: 'normal' },
      { word: 'library', hint: 'A quiet place with books', difficulty: 'normal' },
      { word: 'weather', hint: 'Sun, rain, wind, snow', difficulty: 'easy' },
      { word: 'courage', hint: 'Being brave', difficulty: 'normal' },
      { word: 'diamond', hint: 'A shiny precious stone', difficulty: 'normal' },
      { word: 'island', hint: 'Land surrounded by water', difficulty: 'easy' },
      { word: 'desert', hint: 'A hot sandy place', difficulty: 'easy' },
      { word: 'jungle', hint: 'A thick tropical forest', difficulty: 'normal' },
      { word: 'parrot', hint: 'A talking bird', difficulty: 'easy' },
      { word: 'avocado', hint: 'A green creamy fruit', difficulty: 'normal' },
      { word: 'telescope', hint: 'See the stars with it', difficulty: 'hard' },
      { word: 'fireworks', hint: 'Colourful sky explosions', difficulty: 'normal' }
    ],

    crosswords: [
      { size: 5, grid: [['O','C','E','A','N'],[null,null,null,'N',null],['G','O','A','T',null],[null,'W',null,null,null],['C','L','O','C','K']], clues: { across: [ { num: 1, row: 0, col: 0, clue: 'A huge body of salt water' }, { num: 7, row: 2, col: 0, clue: 'A farm animal with horns' }, { num: 11, row: 4, col: 0, clue: 'Tells the time' } ], down: [ { num: 4, row: 0, col: 3, clue: 'A tiny hard-working insect' }, { num: 8, row: 2, col: 1, clue: 'A bird that stays up at night' } ] } },
      { size: 7, grid: [['M','A','P',null,null,null,null],['O',null,'L','E','G',null,null],['U',null,'A',null,null,'I',null],['S','U','N',null,null,'C',null],['E',null,'T','R','E','E',null],[null,null,null,null,null,null,null],[null,null,null,null,null,null,null]], clues: { across: [ { num: 1, row: 0, col: 0, clue: 'Shows you where to go' }, { num: 5, row: 1, col: 2, clue: 'You walk on it' }, { num: 11, row: 3, col: 0, clue: 'The star that lights our day' }, { num: 15, row: 4, col: 2, clue: 'Tall with leaves and branches' } ], down: [ { num: 1, row: 0, col: 0, clue: 'A small animal with a tail' }, { num: 3, row: 0, col: 2, clue: 'A living thing that grows' }, { num: 10, row: 2, col: 5, clue: 'Frozen water' } ] } },
      { size: 9, grid: [['P','I','A','N','O',null,'C','O','W'],['L',null,null,null,'C',null,'A',null,'A'],['A',null,null,'D','E','S','K',null,'T'],['N',null,null,null,'A',null,'E',null,'E'],['T',null,'W','I','N','D',null,null,'R'],[null,null,null,null,null,'O',null,null,null],[null,null,null,null,null,'O',null,null,null],[null,null,null,null,null,'R',null,null,null],[null,null,null,null,null,null,null,null,null]], clues: { across: [ { num: 1, row: 0, col: 0, clue: 'A musical instrument with keys' }, { num: 6, row: 0, col: 6, clue: 'A farm animal that gives milk' }, { num: 14, row: 2, col: 3, clue: 'You write at it in school' }, { num: 22, row: 4, col: 2, clue: 'Moves the leaves' } ], down: [ { num: 1, row: 0, col: 0, clue: 'A living thing that grows' }, { num: 5, row: 0, col: 4, clue: 'A huge body of salt water' }, { num: 6, row: 0, col: 6, clue: 'Sweet treat for birthdays' }, { num: 8, row: 0, col: 8, clue: 'You drink it every day' }, { num: 24, row: 4, col: 5, clue: 'You open it to enter' } ] } }
    ]
  };

  /* Everyday family / kids words that a 10k-news list often misses. */
  var FAMILY = ('lego ninja cupcake trampoline playdough crayon lunchbox bedtime grandma grandpa cousin niece nephew unicorn skateboard scooter selfie emoji wifi ipad xbox mario pokemon minecraft brownie pretzel nacho smoothie lemonade muffin bagel taco sushi burger popcorn cookie dinosaur pirate wizard princess superhero boardgame crossword checkers chess monopoly charades pictionary karaoke firefighter astronaut magician chalkboard backpack eraser notebook ladybug grasshopper dragonfly yogurt pancake waffle').split(' ');

  function addWord(seen, list, raw) {
    var w = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z]/g, '');
    if (w.length < 3 || w.length > 16 || seen[w]) return;
    seen[w] = true;
    list.push(w);
  }

  function inflectionStems(word) {
    var out = [];
    var n = word.length;
    function add(s) {
      if (s && s.length >= 3 && s.length < n) out.push(s);
    }
    if (n >= 4 && word.slice(-3) === 'ies') add(word.slice(0, -3) + 'y');
    if (n >= 5 && word.slice(-2) === 'es') add(word.slice(0, -2));
    if (n >= 4 && word.charAt(n - 1) === 's' && word.charAt(n - 2) !== 's') add(word.slice(0, -1));
    if (n >= 6 && word.slice(-3) === 'ing') {
      var ing = word.slice(0, -3);
      add(ing);
      add(ing + 'e');
      if (ing.length >= 2 && ing.charAt(ing.length - 1) === ing.charAt(ing.length - 2)) add(ing.slice(0, -1));
    }
    if (n >= 5 && word.slice(-2) === 'ed') {
      var ed = word.slice(0, -2);
      add(ed);
      add(ed + 'e');
      add(word.slice(0, -1));
      if (ed.length >= 2 && ed.charAt(ed.length - 1) === ed.charAt(ed.length - 2)) add(ed.slice(0, -1));
    }
    if (n >= 5 && word.slice(-2) === 'ly') add(word.slice(0, -2));
    return out;
  }

  FF.data.words.rebuild = function () {
    if (!this.core) this.core = (this.dictionary || []).slice();
    var seen = {};
    var list = [];
    var i;
    var src = this.core;
    for (i = 0; i < src.length; i++) addWord(seen, list, src[i]);
    src = this.extra || [];
    for (i = 0; i < src.length; i++) addWord(seen, list, src[i]);
    for (i = 0; i < FAMILY.length; i++) addWord(seen, list, FAMILY[i]);
    src = this.scramble || [];
    for (i = 0; i < src.length; i++) addWord(seen, list, src[i] && src[i].word);
    src = this.missingLetters || [];
    for (i = 0; i < src.length; i++) addWord(seen, list, src[i] && src[i].word);
    src = this.categories || [];
    for (i = 0; i < src.length; i++) {
      var items = src[i] && src[i].items ? src[i].items : [];
      for (var j = 0; j < items.length; j++) addWord(seen, list, items[j]);
    }
    this.dictionary = this.core;
    this._set = seen;
    this.all = list;
    return seen;
  };

  FF.data.words.isWord = function (word) {
    word = String(word == null ? '' : word).toLowerCase().replace(/[^a-z]/g, '');
    if (word.length < 3 || word.length > 16) return false;
    var set = this._set || this.rebuild();
    if (set[word]) return true;
    var stems = inflectionStems(word);
    for (var i = 0; i < stems.length; i++) {
      if (set[stems[i]]) return true;
    }
    return false;
  };

  FF.data.words.rebuild();
})();
