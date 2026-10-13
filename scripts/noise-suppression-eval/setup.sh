#!/bin/sh
#
# Downloads what the noise-suppression bench needs into <work dir>/data,
# checking each download against its sha256, and builds the test set.
# See README.md next to this script.
#
# usage: sh scripts/noise-suppression-eval/setup.sh [work dir]
#        (default tmp/noise-suppression-eval; PYTHON=... picks the interpreter)
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
WORK=${1:-$ROOT/tmp/noise-suppression-eval}
PYTHON=${PYTHON:-python3}
DATA=$WORK/data
mkdir -p "$DATA/valentini" "$DATA/dnsmos" "$DATA/deepfilternet"

fetch() { # url file sha256
  if [ ! -f "$2" ]; then
    curl -fsSL -o "$2.part" "$1"
    mv "$2.part" "$2"
  fi
  echo "$3  $2" | sha256sum -c -
}

# VoiceBank+DEMAND test set, 48 kHz (Valentini et al., CC BY 4.0).
VB=https://datashare.ed.ac.uk/bitstream/handle/10283/2791
fetch "$VB/clean_testset_wav.zip" "$DATA/valentini/clean_testset_wav.zip" b60bfc2b9df38466d8eb45057c087c6e5dee196c67a0ed7bca628ae2a8611c4e
fetch "$VB/noisy_testset_wav.zip" "$DATA/valentini/noisy_testset_wav.zip" ba4a893f45b627f15209ba30ab584dd495b3680cd6f216dd08d143a257611993
for set in clean noisy; do
  [ -d "$DATA/valentini/${set}_testset_wav" ] ||
    "$PYTHON" -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' \
      "$DATA/valentini/${set}_testset_wav.zip" "$DATA/valentini"
done

# MS-SNSD noises, 16 kHz (Microsoft, MIT).
if [ ! -d "$DATA/ms-snsd" ]; then
  git clone -q --filter=blob:none --sparse https://github.com/microsoft/MS-SNSD.git "$DATA/ms-snsd"
fi
git -C "$DATA/ms-snsd" checkout -q fe61c4ba0d9ac8dd7e23d719cc79f8947e1dc742
git -C "$DATA/ms-snsd" sparse-checkout set noise_test noise_train

# DNSMOS P.835 and P.808 (Microsoft DNS Challenge, CC BY 4.0).
DNS=https://github.com/microsoft/DNS-Challenge/raw/591184a9fcb2cbdec02520fed81a32bbbf9d73ff/DNSMOS/DNSMOS
fetch "$DNS/sig_bak_ovr.onnx" "$DATA/dnsmos/sig_bak_ovr.onnx" 269fbebdb513aa23cddfbb593542ecc540284a91849ac50516870e1ac78f6edd
fetch "$DNS/model_v8.onnx" "$DATA/dnsmos/model_v8.onnx" 9246480c58567bc6affd4200938e77eef49468c8bc7ed3776d109c07456f6e91

# DeepFilterNet3, the reference for what a stronger open model does (MIT/Apache-2.0).
fetch https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/deep-filter-0.5.6-x86_64-unknown-linux-musl \
  "$DATA/deepfilternet/deep-filter" 70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da
chmod +x "$DATA/deepfilternet/deep-filter"

[ -f "$WORK/testset/manifest.json" ] || "$PYTHON" -I "$HERE/make_testset.py" "$DATA" "$WORK/testset"
