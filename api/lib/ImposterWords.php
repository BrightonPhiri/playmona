<?php
declare(strict_types=1);

namespace PlayMona;

/**
 * Word Imposter's word pairs. Server-only on purpose: if the list shipped to phones, a player
 * could look up the other word in their pair. Each line is
 *   [word A, word B, hints for A, hints for B, hints that fit both]
 * Hints are one word each, space-separated. Crew players clue from their own word's hints and the
 * shared ones; they never see the other word's hints.
 *
 *   easy:   clearly different things
 *   normal: related, with clues that overlap
 *   hard:   close cousins, hard to tell apart
 */
final class ImposterWords
{
    public const LEVELS = ['easy', 'normal', 'hard'];

    private const PAIRS = [
        'easy' => [
            ['Water', 'Car', 'wet drink ocean rain thirst splash', 'drive wheels road engine garage fuel', 'wash clean'],
            ['Cat', 'Pizza', 'whiskers purr meow paws kitten fur', 'cheese slice oven delivery dough pepperoni', 'round'],
            ['Banana', 'Train', 'yellow peel monkey fruit bunch smoothie', 'rails station ticket carriage passenger track', 'long'],
            ['Moon', 'Shoe', 'night space crater astronaut orbit tide', 'foot laces heel walk sole leather', 'pair'],
            ['Guitar', 'Lion', 'strings strum chord band music acoustic', 'roar mane jungle king pride savanna', 'loud'],
            ['Book', 'Volcano', 'pages read story library author chapter', 'lava erupt ash crater magma mountain', 'cover'],
            ['Rain', 'Bicycle', 'umbrella puddle cloud drops wet storm', 'pedal saddle wheels ride helmet chain', 'outside'],
            ['Elephant', 'Phone', 'trunk tusks grey huge safari ears', 'call text screen ring charger app', 'memory'],
            ['Apple', 'Rocket', 'fruit red orchard crunchy pie juice', 'launch space fuel astronaut blast countdown', 'fast'],
            ['Snow', 'Hammer', 'cold white winter frost flakes ski', 'nail tool hit build carpenter toolbox', 'heavy'],
            ['Bread', 'Airplane', 'loaf toast bakery slice butter sandwich', 'fly pilot wings airport runway passenger', 'rise'],
            ['Fish', 'Chair', 'swim fins gills ocean scales tank', 'sit legs table seat furniture cushion', 'still'],
            ['Sun', 'Pencil', 'hot bright sky summer shine dawn', 'write draw sharpen eraser lead school', 'yellow'],
            ['Football', 'Cake', 'goal kick stadium team pitch referee', 'birthday candles icing bake slice sweet', 'party'],
            ['Tree', 'Television', 'leaves branches roots forest bark shade', 'channel remote screen watch show news', 'tall'],
            ['Ice Cream', 'Lightning', 'cone scoop vanilla sweet melt dessert', 'thunder storm flash bolt sky strike', 'summer'],
            ['Horse', 'Clock', 'gallop saddle hooves stable ride mane', 'time hands tick alarm minutes wall', 'race'],
            ['Bee', 'Bridge', 'honey buzz sting hive flower pollen', 'river cross span crossing arch build', 'busy'],
            ['Egg', 'Mountain', 'yolk shell breakfast chicken fried omelette', 'climb peak summit hike tall snowcap', 'cracked'],
            ['Doctor', 'Tomato', 'hospital patient medicine stethoscope sick clinic', 'red salad sauce ketchup vine juicy', 'healthy'],
            ['Kite', 'Soup', 'wind fly string sky tail breeze', 'bowl spoon hot broth vegetables recipe', 'light'],
            ['Teacher', 'Penguin', 'school lesson classroom homework pupils chalk', 'ice waddle Antarctica feathers cold beak', 'uniform'],
            ['Church', 'Carrot', 'pray Sunday choir pastor worship hymn', 'orange vegetable rabbit crunchy garden root', 'growth'],
            ['Shark', 'Candle', 'teeth fin ocean bite predator swim', 'wax flame wick light birthday melt', 'dark'],
            ['Umbrella', 'Chicken', 'rain open handle dry shade folding', 'feathers egg cluck farm wings roast', 'cover'],
            ['Piano', 'Desert', 'keys music notes play recital concert', 'sand camel dry hot dune cactus', 'grand'],
            ['Ball', 'Cloud', 'bounce throw kick catch round game', 'sky white fluffy rain grey float', 'soft'],
            ['Milk', 'Spider', 'cow white drink glass dairy calcium', 'web legs eight crawl silk creepy', 'fresh'],
            ['Ship', 'Butterfly', 'sail ocean captain anchor deck harbour', 'wings colourful flutter caterpillar flower garden', 'float'],
            ['Rice', 'Star', 'grain bowl cook white dinner boil', 'night sky shine twinkle bright galaxy', 'many'],
            ['Bed', 'Giraffe', 'sleep pillow blanket night mattress dream', 'neck tall spots savanna leaves zoo', 'long'],
            ['Hat', 'River', 'head wear cap brim sun fashion', 'flow water bank fish stream current', 'cool'],
            ['Drum', 'Snake', 'beat rhythm sticks band loud music', 'slither scales venom hiss bite reptile', 'rattle'],
            ['Key', 'Mango', 'lock door open chain house car', 'fruit sweet juicy yellow tropical seed', 'small'],
            ['Door', 'Monkey', 'open close handle knock house entrance', 'banana climb tail jungle cheeky swing', 'brown'],
            ['Bus', 'Flower', 'stop ride passengers driver route ticket', 'petals bloom garden bouquet smell pollen', 'spring'],
            ['Soap', 'Tiger', 'wash bubbles clean hands bath foam', 'stripes roar jungle hunt cat orange', 'slippery'],
            ['Blanket', 'Eagle', 'warm bed cosy wool cover sleep', 'wings soar feathers bird sky talons', 'spread'],
            ['Watch', 'Crocodile', 'time wrist strap minutes battery hours', 'teeth swamp reptile jaws scales river', 'ticking'],
            ['Pillow', 'Lemon', 'sleep soft bed head cushion feathers', 'sour yellow juice citrus squeeze fruit', 'fresh'],
        ],
        'normal' => [
            ['Bus', 'Train', 'stop driver road seats double route', 'rails station platform carriage track whistle', 'ticket passengers commute'],
            ['Cat', 'Dog', 'meow purr whiskers litter independent kitten', 'bark fetch walk loyal puppy leash', 'pet fur paws'],
            ['Beach', 'Swimming Pool', 'sand waves shells ocean tide seaside', 'tiles chlorine lanes deep diving board', 'splash towel summer'],
            ['Guitar', 'Piano', 'strings strum frets pick chord acoustic', 'keys pedals grand black white bench', 'music notes play'],
            ['Lion', 'Tiger', 'mane pride roar savanna king Africa', 'stripes jungle orange Asia prowl solitary', 'cat hunt wild'],
            ['Doctor', 'Nurse', 'diagnose prescription surgeon stethoscope degree consult', 'care ward injection bandage shifts caring', 'hospital patient uniform'],
            ['Apple', 'Orange', 'red crunchy core orchard pie cider', 'peel citrus segments juice zest vitamin', 'fruit round sweet'],
            ['Football', 'Basketball', 'goal kick pitch goalkeeper boots offside', 'hoop dribble court dunk tall bounce', 'team score match'],
            ['Bicycle', 'Motorbike', 'pedal chain gears quiet exercise saddle', 'engine fuel loud throttle speed rider', 'wheels helmet ride'],
            ['Rain', 'Snow', 'puddle umbrella drops drizzle wet storm', 'white frost flakes cold ski sledge', 'weather sky winter'],
            ['Shoe', 'Sock', 'laces sole heel leather shop polish', 'cotton wool drawer smelly stripes knit', 'foot pair wear'],
            ['Pizza', 'Burger', 'slice cheese oven dough Italian topping', 'bun patty grill fries beef stack', 'fast food dinner'],
            ['Church', 'School', 'pray pastor choir worship Sunday hymn', 'lesson teacher homework class exam pupils', 'building bell community'],
            ['Phone', 'Laptop', 'call text pocket ring selfie touchscreen', 'keyboard typing desk work lid trackpad', 'screen charger internet'],
            ['Moon', 'Sun', 'night crater phases tide werewolf lunar', 'day hot bright daylight solar burn', 'sky round light'],
            ['Milk', 'Juice', 'cow white dairy calcium cereal creamy', 'fruit squeeze orange pulp fresh vitamin', 'drink glass breakfast'],
            ['Bed', 'Sofa', 'sleep pillow mattress night duvet dream', 'lounge couch living cushions guests relax', 'comfy furniture lie'],
            ['Teacher', 'Student', 'marking lesson chalk board staff grading', 'learn homework exams backpack pupil grades', 'school class books'],
            ['Chicken', 'Duck', 'cluck coop eggs rooster farm roast', 'quack pond waddle webbed swim bread', 'bird feathers wings'],
            ['Shark', 'Dolphin', 'teeth predator fin jaws attack hunter', 'clever playful clicks jump friendly smile', 'ocean swim grey'],
            ['Airplane', 'Helicopter', 'wings runway airport jet cabin pilot', 'rotor hover blades rescue spin landing', 'fly sky noise'],
            ['Bread', 'Cake', 'loaf toast sandwich slice yeast bakery', 'birthday icing candles sweet frosting party', 'bake oven flour'],
            ['Hat', 'Helmet', 'brim fashion sun cap wool style', 'safety hard bike motorbike protect crash', 'head wear strap'],
            ['Mountain', 'Volcano', 'climb summit peak hike snowcap range', 'lava erupt ash magma crater smoke', 'tall rock high'],
            ['Rice', 'Pasta', 'grain bowl white fried steam Asian', 'Italian spaghetti noodles sauce penne boil', 'dinner carbs cook'],
            ['Spoon', 'Fork', 'soup stir scoop cereal dessert ladle', 'prongs stab spaghetti tines salad pick', 'cutlery eat metal'],
            ['Book', 'Newspaper', 'novel chapter author library story fiction', 'daily headlines editor journalist print morning', 'read pages words'],
            ['Bee', 'Butterfly', 'honey sting buzz hive queen worker', 'colourful caterpillar flutter cocoon delicate pretty', 'wings flower garden'],
            ['Ring', 'Necklace', 'finger wedding engagement band proposal diamond', 'collar chain pendant beads locket choker', 'jewellery gold gift'],
            ['Wedding', 'Birthday', 'bride groom vows rings aisle honeymoon', 'candles age presents balloons yearly surprise', 'party cake celebrate'],
            ['Farm', 'Garden', 'tractor barn cows fields harvest crops', 'flowers lawn hose shed backyard bench', 'grow plants soil'],
            ['Cow', 'Goat', 'milk moo cattle beef dairy udder', 'beard horns climb bleat cheese kid', 'farm grass animal'],
            ['Kitchen', 'Bathroom', 'cook oven fridge stove dishes recipe', 'shower toilet tub towel mirror soap', 'sink tap tiles'],
            ['Television', 'Radio', 'screen watch channel remote series picture', 'listen station frequency DJ podcast speaker', 'news shows broadcast'],
            ['Soap', 'Shampoo', 'bar hands wash bubbles bath body', 'hair bottle conditioner scalp lather salon', 'clean shower foam'],
            ['Banana', 'Mango', 'yellow peel bunch monkey long smoothie', 'seed juicy tropical sticky orange stone', 'fruit sweet ripe'],
            ['Ship', 'Submarine', 'deck sail captain harbour cruise mast', 'underwater periscope torpedo dive sonar deep', 'ocean navy crew'],
            ['Eagle', 'Owl', 'soar talons bald mountain national sharp', 'night hoot wise eyes barn nocturnal', 'bird wings hunt'],
            ['Hospital', 'Pharmacy', 'ward surgery emergency beds ambulance doctor', 'prescription pills counter chemist tablets shop', 'medicine sick health'],
            ['Carrot', 'Potato', 'orange crunchy rabbit stick raw sweet', 'chips mash fries peel baked starchy', 'vegetable ground soup'],
        ],
        'hard' => [
            ['Coffee', 'Tea', 'espresso beans latte barista bitter caffeine', 'leaves green kettle herbal Chinese brew', 'hot cup morning'],
            ['River', 'Lake', 'flow current stream bank long delta', 'still calm shore island fishing boating', 'water fresh swim'],
            ['Watch', 'Clock', 'wrist strap wear smart pocket buckle', 'wall alarm tower cuckoo grandfather kitchen', 'time hands minutes'],
            ['Mountain', 'Hill', 'summit peak snow climb tall range', 'gentle green roll slope small walk', 'high view top'],
            ['Lemon', 'Lime', 'yellow sour tart squeeze curd zesty', 'green tropical mojito small tangy key', 'citrus juice fruit'],
            ['Crocodile', 'Alligator', 'saltwater Nile Australia pointed estuary huge', 'Florida swamp America rounded Louisiana snout', 'reptile teeth jaws'],
            ['Butter', 'Cheese', 'spread toast melt bread churn cream', 'mouse slice cheddar grate pizza holes', 'dairy yellow fridge'],
            ['Rabbit', 'Hamster', 'ears hop carrot burrow bunny garden', 'wheel cage cheeks tiny nocturnal pouch', 'pet fur small'],
            ['Pen', 'Pencil', 'ink cap click ballpoint sign permanent', 'sharpen eraser lead graphite sketch wooden', 'write school draw'],
            ['Cup', 'Mug', 'saucer handle tiny china small delicate', 'big chunky coffee office printed thick', 'drink hot tea'],
            ['Sofa', 'Armchair', 'long couch three lounge nap seats', 'single reading fireside grandpa one solo', 'sit comfy cushion'],
            ['Jam', 'Honey', 'strawberry jar spread fruit preserve toast', 'bees golden sticky hive comb sweetener', 'sweet jar toast'],
            ['Mouse', 'Rat', 'tiny cheese squeak cute computer field', 'sewer big tail pest plague city', 'rodent small whiskers'],
            ['Frog', 'Toad', 'jump pond green slimy prince lily', 'warts bumpy brown dry garden poison', 'croak amphibian hop'],
            ['Violin', 'Cello', 'chin small fiddle high orchestra solo', 'big floor deep low sit large', 'bow strings classical'],
            ['Muffin', 'Cupcake', 'breakfast blueberry bran tall rustic morning', 'icing frosting sprinkles party decorated swirl', 'bake sweet paper'],
            ['Jacket', 'Coat', 'short denim leather zip light bomber', 'long winter heavy warm parka buttons', 'wear outside pockets'],
            ['Sandals', 'Slippers', 'beach straps summer outdoor toes holiday', 'indoor fluffy cosy bedroom warm morning', 'feet comfy open'],
            ['Knife', 'Scissors', 'blade cut kitchen sharp chop slice', 'paper snip craft blades handles haircut', 'sharp cut metal'],
            ['Train', 'Tram', 'station long fast intercity carriage journey', 'city street overhead short stops cable', 'rails track passengers'],
            ['Shop', 'Market', 'store till door shelves owner indoor', 'stalls outdoor fresh vendors haggle busy', 'buy sell money'],
            ['Van', 'Truck', 'delivery sliding small courier family camper', 'heavy big cargo trailer lorry diesel', 'drive load road'],
            ['Cookie', 'Cracker', 'sweet chocolate chip dough jar dunk', 'salty crisp cheese plain dry savoury', 'snack crunchy baked'],
            ['Pillow', 'Cushion', 'bed sleep head bedroom case night', 'sofa decor throw chair square couch', 'soft fluffy comfort'],
            ['Moth', 'Butterfly', 'night lamp dull brown wardrobe fuzzy', 'colourful day bright garden pretty monarch', 'wings insect fly'],
            ['Pumpkin', 'Watermelon', 'orange Halloween carve pie autumn soup', 'green red seeds juicy summer slice', 'big round fruit'],
            ['Library', 'Bookshop', 'borrow quiet card return free members', 'buy till new bestseller cafe browse', 'novels shelves read'],
            ['Doctor', 'Dentist', 'stethoscope fever prescription checkup clinic flu', 'teeth drill braces floss cavity smile', 'appointment chair health'],
            ['Police', 'Soldier', 'officer arrest siren badge patrol station', 'army war camouflage rifle barracks march', 'uniform protect duty'],
            ['Wolf', 'Fox', 'pack howl moon grey big wild', 'sly orange bushy clever small tail', 'hunt dog forest'],
            ['Peanut', 'Almond', 'butter shell allergy monkey salted roasted', 'milk flaked marzipan oval tree slivered', 'nut snack crunchy'],
            ['Candle', 'Lamp', 'wax wick flame melt scented birthday', 'bulb switch shade electric bedside plug', 'light glow night'],
            ['Aunt', 'Grandmother', 'niece nephew sister cousins young uncle', 'old granny wise knitting grandkids elder', 'family relative love'],
            ['Soup', 'Stew', 'thin broth bowl starter tomato spoon', 'thick chunky slow meat hearty casserole', 'hot pot vegetables'],
            ['Necklace', 'Bracelet', 'collar pendant chain locket long choker', 'wrist bangle charm arm cuff beaded', 'jewellery gold gift'],
            ['Thunder', 'Lightning', 'boom rumble loud noise clap roar', 'flash bolt bright strike zap electric', 'storm sky rain'],
            ['Chess', 'Cards', 'king board checkmate pawn knight queen', 'deck shuffle poker hand deal suits', 'game play table'],
            ['Kettle', 'Teapot', 'boil electric whistle switch steam spout', 'brew china pour ceramic leaves cosy', 'tea hot water'],
            ['Gold', 'Silver', 'yellow first medal treasure bar rich', 'second grey shiny cutlery coins moon', 'metal jewellery precious'],
            ['Bee', 'Wasp', 'honey hive fuzzy pollen queen flowers', 'angry picnic nest yellow thin jam', 'sting buzz insect'],
        ],
    ];

    /** Every pair at a level, as arrays with id, a, b, hintsA, hintsB, shared. */
    public static function all(string $level): array
    {
        $rows = self::PAIRS[self::level($level)];
        return array_map(fn (array $r) => self::row($r), $rows);
    }

    /** easy | normal | hard. The room's "normal" is the middle list. */
    public static function level(string $difficulty): string
    {
        return in_array($difficulty, self::LEVELS, true) ? $difficulty : 'normal';
    }

    /**
     * A random pair at this level, avoiding the ids in $recent while any other pair is left.
     * $randomInt(n) -> 0..n-1; random_int by default.
     */
    public static function pick(string $difficulty, array $recent = [], ?callable $randomInt = null): array
    {
        $randomInt ??= fn (int $n) => random_int(0, $n - 1);
        $all = self::all($difficulty);
        $fresh = array_values(array_filter($all, fn ($p) => !in_array($p['id'], $recent, true)));
        $from = $fresh ?: $all;
        return $from[$randomInt(count($from))];
    }

    private static function row(array $r): array
    {
        $split = fn (string $s) => array_values(array_filter(explode(' ', $s), 'strlen'));
        return [
            'id' => self::slug($r[0]) . '-' . self::slug($r[1]),
            'a' => $r[0],
            'b' => $r[1],
            'hintsA' => $split($r[2]),
            'hintsB' => $split($r[3]),
            'shared' => $split($r[4]),
        ];
    }

    private static function slug(string $w): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($w)), '-');
    }
}
