from __future__ import annotations

import torch
from torch import nn


class ForecastLSTM(nn.Module):
    def __init__(self, input_dim: int = 5, hidden_dim: int = 128, num_layers: int = 2, dropout: float = 0.3):
        super().__init__()
        self.lstm = nn.LSTM(
            input_dim,
            hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout,
        )
        self.dropout = nn.Dropout(dropout)
        self.output = nn.Linear(hidden_dim, 1)
        self.activation = nn.Sigmoid()

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        outputs, _ = self.lstm(inputs)
        last_hidden = outputs[:, -1, :]
        logits = self.output(self.dropout(last_hidden))
        return self.activation(logits).squeeze(-1)