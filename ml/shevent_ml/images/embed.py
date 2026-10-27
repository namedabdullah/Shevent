"""CLIP embeddings (OpenCLIP), L2-normalised so the dot product of two embeddings is their cosine similarity.

The same model embeds text, which Phase 2 uses for zero-shot tags ("a photo of a wedding stage with flowers").
torch and open_clip are imported here only, so hashing works without them.
"""

import numpy as np

from shevent_ml.config import load_config


class ClipEmbedder:
    def __init__(self, model=None, pretrained=None, device="cpu"):
        import open_clip
        import torch

        settings = load_config("images")["clip"]
        self.name = model or settings["model"]
        self.pretrained = pretrained or settings["pretrained"]
        self.batch_size = settings["batch_size"]
        self.device = device
        self._torch = torch
        # The weights download once (about 600 MB) into the Hugging Face cache.
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            self.name, pretrained=self.pretrained, device=device
        )
        self.model.eval()
        self.tokenizer = open_clip.get_tokenizer(self.name)

    @property
    def version(self):
        return f"{self.name}/{self.pretrained}"

    def _normalise(self, features):
        features = features / features.norm(dim=-1, keepdim=True)
        return features.cpu().numpy().astype(np.float32)

    def embed_images(self, images):
        """PIL images -> (n, d) float32 array."""
        batches = []
        with self._torch.no_grad():
            for start in range(0, len(images), self.batch_size):
                batch = self._torch.stack([self.preprocess(im) for im in images[start : start + self.batch_size]])
                batches.append(self._normalise(self.model.encode_image(batch.to(self.device))))
        return np.concatenate(batches) if batches else np.zeros((0, self.model.visual.output_dim), np.float32)

    def embed_texts(self, texts):
        with self._torch.no_grad():
            return self._normalise(self.model.encode_text(self.tokenizer(texts).to(self.device)))
