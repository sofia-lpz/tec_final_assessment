SCIENCE_PER_RANGE = 30
COLONIZE_COST = 50
CONQUER_COST = 100
DESTROY_COST = 150
SCIENCE_PER_EXPLORE = 1
SCIENCE_PER_BROADCAST = 5
SCIENCE_PER_PLANET = 1.0        # passive research per owned planet per step
CONQUER_SCIENCE_FRACTION = 0.5

MIN_PLANET_RESOURCES = 50
MAX_PLANET_RESOURCES = 200

dict_reward_weights = {
            "explore": 0.1,        # per newly explored cell
            "broadcast": 0.1,      # per civ that newly hears the broadcast
            "survive": 0.1,        # per step still alive
            "science": 0.01,       # per unit change in science (signed)
            "colonize": 1.0,       # successful empty colonization
            "conquer": 3.0,        # successful hostile takeover
            "destroy": 3.0,        # successful planet destruction
            "destroyed": 10.0,     # subtracted if this civ is wiped this step
            "win": 50.0,           # bonus for being the last civ standing
            "invalid": 0.0,        # subtracted if a (masked-out) action is a no-op
}

GROUP = "agents"