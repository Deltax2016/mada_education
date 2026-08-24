# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# ffmpeg for probing and transcoding video.
# pango + harfbuzz + Noto Arabic so WeasyPrint shapes Arabic correctly in PDFs.
# Missing Arabic fonts here is the classic bug that only shows up in production,
# when the first certificate comes out as a row of empty boxes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libfribidi0 \
      fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies only. The application is not installed as a package: it runs from
# src/ directly, and `uv pip install .` would need the sources to be present in
# this layer, which would also throw away the dependency cache on every code
# change.
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv \
    && uv pip install --system --no-cache -r pyproject.toml

COPY src ./src

RUN useradd -m -u 1001 app && chown -R app:app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health/ready')"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
