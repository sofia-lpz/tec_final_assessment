from rewards import *

class Civilization:
    def __init__(self, env, name, coord, science, resources, harvest_rate):
        self.env = env
        self.name = name
        self.coord = coord  # planet coordinates
        self.science = science
        self.resources = resources
        self.harvest_rate = harvest_rate
        self.known_civilizations = []
        self.explored_cells = set()
        self.alive = True

        # claim the home planet if one exists and is unowned
        home = self.env.planet_at(coord)
        if home is not None and not home.destroyed and home.civilization is None:
            home.civilization = self

#helpers
    def _all_civilizations(self):
        return [c for c in self.env.civs.values() if c is not self and c.alive]

    def _planet_on(self, coord):
        return self.env.planet_at(coord)

    def _planets_of(self, civ):
        return [p for p in self.env.planets
                if p.civilization is civ and not p.destroyed]

    def _wipe(self, civ):
        civ.alive = False
        for p in self.env.planets:
            if p.civilization is civ:
                p.civilization = None

    @property
    def exploration_radius(self):
        return 1 + int(self.science // SCIENCE_PER_RANGE)

    def update(self):
        owned = self._planets_of(self)

        # a civilization dies when it owns no surviving planets
        if not owned:
            self._wipe(self)
            return

        # Harvest resources from planets
        if self.harvest_rate:
            self.resources += sum(self.harvest_rate * p.resources for p in owned)

        # Passive research: each owned planet generates science every step
        self.science += len(owned) * SCIENCE_PER_PLANET

    def explore(self):
        radius = self.exploration_radius
        origins = {self.coord}
        for p in self._planets_of(self):
            origins.add(p.coord)

        before = len(self.explored_cells)
        for origin in origins:
            self.explored_cells |= self.env.neighborhood(origin, radius)
        newly = len(self.explored_cells) - before
        self.science += newly * SCIENCE_PER_EXPLORE
        return newly

    def broadcast_position(self):
        # TODO: maybe reward even when fc
        newly_reached = 0
        for civ in self._all_civilizations():
            if self not in civ.known_civilizations:
                civ.known_civilizations.append(self)
                newly_reached += 1
            civ.explored_cells.add(self.coord)
        self.science += newly_reached * SCIENCE_PER_BROADCAST
        return newly_reached

    def colonize_empty_planet(self, coord):
        if coord not in self.explored_cells:
            return False
        planet = self._planet_on(coord)
        if planet is None or planet.destroyed:
            return False
        if planet.civilization is not None:
            return False
        if self.resources < COLONIZE_COST:
            return False
        self.resources -= COLONIZE_COST
        planet.civilization = self
        return True

    def destroy_planet(self, coord):
        if coord not in self.explored_cells:
            return False
        planet = self._planet_on(coord)
        if planet is None or planet.destroyed:
            return False
        if self.resources < DESTROY_COST:
            return False
        self.resources -= DESTROY_COST

        former_owner = planet.civilization
        planet.destroyed = True
        planet.civilization = None
        planet.resources = 0

        if former_owner is not None and former_owner is not self:
            if not self._planets_of(former_owner):
                self._wipe(former_owner)
        return True

    def colonize_inhabited_planet(self, coord):
        if coord not in self.explored_cells:
            return False
        planet = self._planet_on(coord)
        if planet is None or planet.destroyed:
            return False
        resident = planet.civilization
        if resident is None or resident is self:
            return False
        if self.resources < CONQUER_COST:
            return False
        self.resources -= CONQUER_COST

        # first strike always wins: absorb part of their research, seize the planet
        gained = resident.science * CONQUER_SCIENCE_FRACTION
        self.science += gained
        resident.science -= gained
        planet.civilization = self
        if not self._planets_of(resident):
            self._wipe(resident)
        return True