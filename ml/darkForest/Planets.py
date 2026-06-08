class Planet:

    def __init__(self, coord, resources):
        self.coord = coord            
        self.resources = resources
        self.civilization = None      
        self.destroyed = False