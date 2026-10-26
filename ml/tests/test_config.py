from shevent_ml import config


def test_paths_resolve_from_repo_root():
    assert (config.REPO_ROOT / "ml" / "pyproject.toml").exists()
    assert (config.REFERENCE_DIR / "categories.csv").exists()


def test_load_config_reads_yaml(tmp_path, monkeypatch):
    (tmp_path / "quote_checker.yaml").write_text("yellow_max_over_high: 0.25\n", encoding="utf-8")
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    assert config.load_config("quote_checker") == {"yellow_max_over_high": 0.25}


def test_load_config_empty_file_gives_empty_dict(tmp_path, monkeypatch):
    (tmp_path / "empty.yaml").write_text("", encoding="utf-8")
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path)
    assert config.load_config("empty") == {}


def test_tracking_uri_defaults_to_local_server(monkeypatch):
    monkeypatch.delenv("MLFLOW_TRACKING_URI", raising=False)
    assert config.mlflow_tracking_uri() == config.DEFAULT_MLFLOW_URI
