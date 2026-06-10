SCIENCE_PER_RANGE = 50          
BIRTH_RATE_STEP = 0.1
COLONIZE_COST = 50
CONQUER_COST = 100              
DESTROY_COST = 150
SCIENCE_PER_EXPLORE = 1         
SCIENCE_PER_BROADCAST = 5
CONQUER_SCIENCE_FRACTION = 0.5  

MIN_PLANET_RESOURCES = 50
MAX_PLANET_RESOURCES = 200

ADD_BIRTH_RATE_COST = 100

dict_reward_weights = {
            "explore": 0.1,        # per newly explored cell
            "broadcast": 0.5,      # per civ that newly hears the broadcast
            "survive": 0.1,        # per step still alive
            "population": 0.01,    # per unit change in population (signed)
            "science": 0.01,       # per unit change in science (signed)
            "colonize": 1.0,       # successful empty colonization
            "conquer": 2.0,        # successful hostile takeover
            "destroyed": 10.0,     # subtracted if this civ is wiped this step
            "invalid": 0.0,        # subtracted if a (masked-out) action is a no-op
}