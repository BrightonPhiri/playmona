/* ============================================================
   PLAYMONA — animals.js
   Guess the Animal: 64 animals with wildlife photos.
     id     file name: assets/images/games/guessAnimal/<id>.webp
            and <id>-closeup.webp (made by tools/process-game-art.py
            from the art in docs/art/guessAnimal-prompts.md)
     group  animals that look alike, used for harder wrong answers
     kind   shown after answering
   The old drawn animals in visual.js stay for the other games.
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  // Long names carry soft hyphens (\u00AD) so a phone's narrow answer
  // button splits them at a syllable instead of mid-letter.
  function a(id, name, group, kind, fact) {
    return { id: id, name: name, group: group, kind: kind, fact: fact };
  }

  FF.data.animals = [
    a('lion', 'Lion', 'big-cats', 'Mammal', 'Lions are the only cats that live in groups, called prides.'),
    a('tiger', 'Tiger', 'big-cats', 'Mammal', 'No two tigers have the same stripes, and even their skin is striped.'),
    a('leopard', 'Leopard', 'big-cats', 'Mammal', 'Leopards often drag their food up into trees to keep it safe.'),
    a('cheetah', 'Cheetah', 'big-cats', 'Mammal', 'Cheetahs are the fastest land animals, sprinting at about 100 km/h.'),
    a('snow-leopard', 'Snow leopard', 'big-cats', 'Mammal', 'Snow leopards wrap their thick tails around themselves like a scarf.'),
    a('brown-bear', 'Brown bear', 'bears', 'Mammal', 'Brown bears can smell food from kilometres away.'),
    a('polar-bear', 'Polar bear', 'bears', 'Mammal', 'Under their white fur, polar bears have black skin to soak up heat.'),
    a('giant-panda', 'Giant panda', 'bears', 'Mammal', 'Giant pandas spend up to 14 hours a day eating bamboo.'),
    a('gorilla', 'Gorilla', 'apes', 'Mammal', 'Gorillas are the largest apes, and a silverback leads each family.'),
    a('chimpanzee', 'Chim\u00ADpanzee', 'apes', 'Mammal', 'Chimpanzees use sticks as tools to fish termites out of their mounds.'),
    a('orangutan', 'Orang\u00ADutan', 'apes', 'Mammal', 'Orangutans build a fresh nest of leaves to sleep in almost every night.'),
    a('ring-tailed-lemur', 'Ring-tailed lemur', 'apes', 'Mammal', 'Ring-tailed lemurs live wild only on Madagascar and hold their tails up high.'),
    a('elephant', 'Ele\u00ADphant', 'savanna', 'Mammal', 'Elephants use their trunks to breathe, smell, drink and pick things up.'),
    a('giraffe', 'Giraffe', 'savanna', 'Mammal', 'Giraffes are the tallest animals on Earth.'),
    a('zebra', 'Zebra', 'savanna', 'Mammal', 'No two zebras have exactly the same stripe pattern.'),
    a('hippopotamus', 'Hippo\u00ADpota\u00ADmus', 'savanna', 'Mammal', 'Hippos spend most of the day in water to keep their skin cool.'),
    a('rhinoceros', 'Rhino\u00ADceros', 'savanna', 'Mammal', 'A rhino’s horn is made of keratin, the same stuff as your fingernails.'),
    a('meerkat', 'Meerkat', 'savanna', 'Mammal', 'Meerkats take turns standing guard and call out when danger is near.'),
    a('horse', 'Horse', 'farm', 'Mammal', 'Horses can doze standing up by locking their legs.'),
    a('cow', 'Cow', 'farm', 'Mammal', 'A cow’s stomach has four parts, which helps it digest grass.'),
    a('pig', 'Pig', 'farm', 'Mammal', 'Pigs are very clever, and they roll in mud to keep cool.'),
    a('sheep', 'Sheep', 'farm', 'Mammal', 'Farm sheep’s wool never stops growing, so they need a haircut every year.'),
    a('goat', 'Goat', 'farm', 'Mammal', 'Goats have rectangle-shaped pupils that help them see all around.'),
    a('camel', 'Camel', 'farm', 'Mammal', 'A camel’s hump stores fat, not water, to use for energy.'),
    a('wolf', 'Wolf', 'wild', 'Mammal', 'Wolves live and hunt together in family groups called packs.'),
    a('fox', 'Fox', 'wild', 'Mammal', 'Red foxes can hear a mouse under the snow and pounce right on it.'),
    a('deer', 'Deer', 'wild', 'Mammal', 'Male deer grow a brand new set of antlers every year.'),
    a('raccoon', 'Raccoon', 'wild', 'Mammal', 'Raccoons have very sensitive front paws and often feel their food in water.'),
    a('squirrel', 'Squir\u00ADrel', 'wild', 'Mammal', 'Squirrels bury nuts for later, and the forgotten ones can grow into trees.'),
    a('hedgehog', 'Hedge\u00ADhog', 'wild', 'Mammal', 'A hedgehog has thousands of spines and rolls into a prickly ball when scared.'),
    a('sloth', 'Sloth', 'wild', 'Mammal', 'Sloths move so slowly that tiny green algae grow in their fur.'),
    a('otter', 'Otter', 'wild', 'Mammal', 'Sea otters sometimes hold paws while they sleep so they don’t drift apart.'),
    a('dog', 'Dog', 'pets', 'Mammal', 'A dog’s sense of smell is thousands of times stronger than ours.'),
    a('cat', 'Cat', 'pets', 'Mammal', 'Cats sleep for around 12 to 16 hours a day.'),
    a('rabbit', 'Rabbit', 'pets', 'Mammal', 'A rabbit’s teeth never stop growing, so chewing keeps them short.'),
    a('kangaroo', 'Kanga\u00ADroo', 'australia', 'Mammal', 'A baby kangaroo, called a joey, grows up inside its mother’s pouch.'),
    a('koala', 'Koala', 'australia', 'Mammal', 'Koalas eat eucalyptus leaves and sleep up to 20 hours a day.'),
    a('platypus', 'Platy\u00ADpus', 'australia', 'Mammal', 'The platypus is one of the very few mammals that lay eggs.'),
    a('eagle', 'Eagle', 'birds', 'Bird', 'Eagles have such sharp eyes that they can spot a fish from high in the sky.'),
    a('owl', 'Owl', 'birds', 'Bird', 'Owls can turn their heads about three-quarters of the way around.'),
    a('parrot', 'Parrot', 'birds', 'Bird', 'Some parrots can copy human words, and macaws can live for over 50 years.'),
    a('penguin', 'Penguin', 'birds', 'Bird', 'Penguins can’t fly, but they are superb swimmers.'),
    a('flamingo', 'Flamin\u00ADgo', 'birds', 'Bird', 'Flamingos are pink because of the colours in the shrimp and algae they eat.'),
    a('peacock', 'Peacock', 'birds', 'Bird', 'Only the males, called peacocks, have the big colourful tail feathers.'),
    a('toucan', 'Toucan', 'birds', 'Bird', 'A toucan’s huge beak is light because it is full of tiny air pockets.'),
    a('ostrich', 'Ostrich', 'birds', 'Bird', 'The ostrich is the biggest bird in the world and lays the biggest eggs.'),
    a('hummingbird', 'Humming\u00ADbird', 'birds', 'Bird', 'Hummingbirds can fly backwards and beat their wings dozens of times a second.'),
    a('crocodile', 'Croco\u00ADdile', 'reptiles', 'Reptile', 'Crocodiles have one of the strongest bites of any animal.'),
    a('snake', 'Snake', 'reptiles', 'Reptile', 'Snakes smell with their tongues by flicking them in and out.'),
    a('turtle', 'Turtle', 'reptiles', 'Reptile', 'Sea turtles return to the beach where they hatched to lay their own eggs.'),
    a('chameleon', 'Chame\u00ADleon', 'reptiles', 'Reptile', 'A chameleon’s eyes move separately, so it can look two ways at once.'),
    a('frog', 'Frog', 'amphibians', 'Amphibian', 'Frogs don’t drink with their mouths. They soak up water through their skin.'),
    a('shark', 'Shark', 'ocean', 'Fish', 'Sharks grow new teeth all their lives and can lose thousands of them.'),
    a('dolphin', 'Dolphin', 'ocean', 'Mammal', 'Dolphins call each other with their own special whistles, a bit like names.'),
    a('whale', 'Whale', 'ocean', 'Mammal', 'Humpback whales sing long songs that travel far across the ocean.'),
    a('octopus', 'Octopus', 'ocean', 'Invertebrate', 'An octopus has three hearts and blue blood.'),
    a('seal', 'Seal', 'ocean', 'Mammal', 'Harbour seals can nap underwater and rise to breathe without waking up.'),
    a('jellyfish', 'Jelly\u00ADfish', 'ocean', 'Invertebrate', 'Jellyfish have no brain, no heart and no bones.'),
    a('clownfish', 'Clown\u00ADfish', 'ocean', 'Fish', 'Clownfish live safely among stinging sea anemones thanks to a slimy coat.'),
    a('seahorse', 'Sea\u00ADhorse', 'ocean', 'Fish', 'Seahorse dads carry the eggs in a pouch until the babies hatch.'),
    a('butterfly', 'Butter\u00ADfly', 'insects', 'Insect', 'Butterflies taste with their feet.'),
    a('bee', 'Bee', 'insects', 'Insect', 'Honeybees dance to tell each other where to find flowers.'),
    a('ant', 'Ant', 'insects', 'Insect', 'Ants can carry many times their own body weight.'),
    a('ladybug', 'Ladybug', 'insects', 'Insect', 'Ladybugs help gardeners by eating tiny pests called aphids.')
  ];

  // Groups with too few members to fill a question borrow lookalikes here.
  FF.data.animalNearGroups = {
    'big-cats': ['wild'],
    bears: ['wild', 'apes'],
    apes: ['wild'],
    savanna: ['farm', 'big-cats'],
    farm: ['savanna', 'pets'],
    wild: ['pets', 'australia'],
    pets: ['wild', 'farm'],
    australia: ['wild', 'pets'],
    birds: [],
    reptiles: ['amphibians', 'ocean'],
    amphibians: ['reptiles'],
    ocean: ['reptiles'],
    insects: ['amphibians']
  };
})();
