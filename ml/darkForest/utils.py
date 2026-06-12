import torch
import torch.nn as nn

class ObsFlatten(nn.Module):
    """[*, n_agents, C, H, W] map + [*, n_agents, 5] stats -> flat vector."""

    def forward(self, map_t, self_t):
        flat = map_t.flatten(start_dim=-3)
        return torch.cat([flat, self_t], dim=-1)


class MaskSanitize(nn.Module):
    """Bool mask; rows with no legal action (dead/padded agents) allow
    action 0 so MaskedCategorical stays finite."""

    def forward(self, action_mask):
        mask = action_mask.bool().clone()
        empty = ~mask.any(dim=-1)
        if empty.any():
            mask[..., 0] |= empty
        return mask