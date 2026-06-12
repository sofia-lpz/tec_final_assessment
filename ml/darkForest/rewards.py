<<<<<<< Updated upstream
SCIENCE_PER_RANGE = 50          
=======
# Game constants — tuned so the dark-forest dynamic can emerge:
#  * discovery is SLOW unless someone broadcasts (hiding is a viable strategy)
#  * striking first is CHEAP and ALWAYS succeeds (revealing yourself is fatal)
SCIENCE_PER_RANGE = 50   # back to cleanrl value: exploration radius grows slowly
>>>>>>> Stashed changes
COLONIZE_COST = 50
CONQUER_COST = 10        # cheap first strike — affordable from initial resources
DESTROY_COST = 80        # pricier than conquering since you gain no planet
SCIENCE_PER_EXPLORE = 1
SCIENCE_PER_BROADCAST = 5
<<<<<<< Updated upstream
CONQUER_SCIENCE_FRACTION = 0.5  
=======
CONQUER_SCIENCE_FRACTION = 0.5
>>>>>>> Stashed changes

MIN_PLANET_RESOURCES = 50
MAX_PLANET_RESOURCES = 200

dict_reward_weights = {
<<<<<<< Updated upstream
            "explore": 0.1,        # per newly explored cell
            "broadcast": 0.1,      # per civ that newly hears the broadcast
            "survive": 0.1,        # per step still alive
            "population": 0.01,    # per unit change in population (signed)
            "science": 0.01,       # per unit change in science (signed)
            "colonize": 1.0,       # successful empty colonization
            "conquer": 3.0,        # successful hostile takeover
            "destroyed": 10.0,     # subtracted if this civ is wiped this step
            "invalid": 0.0,        # subtracted if a (masked-out) action is a no-op
=======
    "explore":    0.1,    # per newly explored cell
    "broadcast":  0.5,    # per civ newly reached — the TEMPTATION: broadcasting
                          # is genuinely rewarding (and reveals targets to you),
                          # agents must *learn* that it gets them killed
    "survive":    0.1,    # per step still alive
    "population": 0.0,   # per unit RAW change in population (signed)
    "science":    0.01,   # per unit RAW change in science (signed)
    "colonize":   1.0,    # successful empty colonization
    "conquer":    20.0,    # aggression incentive: highest-value single action
    "destroy":    4.0,    # positive, but below conquer (no planet gained)
    "destroyed":  30.0,   # subtracted if this civ is wiped this step
    "win":        25.0,   # sole-survivor bonus — keeps the endgame aggressive
    "invalid":    0.0,    # match cleanrl: no penalty for no-op targeting
>>>>>>> Stashed changes
}

GROUP = "agents"