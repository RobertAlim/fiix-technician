// src/screens/CropImageScreen.tsx
//
// The mobile-specific half of matching the web app's nozzle-photo output
// (see src/lib/image-processing.ts for the other half — the actual
// resize/compress numbers, ported from web's real source). Web gets its
// "only the relevant portion of the photo" framing for free — either the
// technician physically composes the shot within a fixed viewfinder
// (live camera), or the photo just already was cropped to the document
// before it was picked from the gallery. Mobile's camera hands back
// whatever the phone's native camera UI captured (the whole room, not
// just the printed test page — see the reference screenshot this screen
// exists to fix), so there's no equivalent "it's already framed right"
// shortcut here. This screen is that missing step: a plain freeform
// drag-to-move / drag-corners-to-resize rectangle over the raw photo, no
// locked aspect ratio (matching that web doesn't enforce one fixed shape
// either — its output aspect is whatever the technician composed/
// selected), confirmed by tapping "Use This Area".
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

import { emitCrop } from "@/lib/crop-bridge";
import { cropAndOptimizeNozzlePhoto } from "@/lib/image-processing";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";

type CropRoute = RouteProp<RootStackParamList, "CropImage">;

const HANDLE_SIZE = 28;
const MIN_CROP_SIZE = 48;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Corner = "tl" | "tr" | "bl" | "br";

export function CropImageScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<CropRoute>();

  // The uri actually displayed/cropped from — NOT params.uri directly.
  // See the useEffect below for why: this is the raw capture re-encoded
  // once to bake its EXIF orientation into the pixel buffer, which is
  // what was actually producing "saves the top-left corner instead of
  // the selected area" — that bug was a coordinate-space mismatch, not a
  // math error in the crop rect itself.
  const [normalizedUri, setNormalizedUri] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [layout, setLayout] = useState<{ dispW: number; dispH: number } | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Only ever read inside gesture callbacks, which close over stale state
  // otherwise (PanResponder handlers are created once, not per-render).
  const cropRef = useRef<Rect | null>(null);
  const dragStart = useRef<Rect | null>(null);

  const setCropBoth = (r: Rect) => {
    cropRef.current = r;
    setCrop(r);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // THE ACTUAL FIX: a phone camera's raw pixel buffer is very often
        // physically landscape with an EXIF orientation tag (e.g. "rotate
        // 90°") applied on TOP for a portrait shot — extremely common for
        // exactly the kind of portrait photo a technician takes of a
        // printed test page. React Native's <Image> (and Image.getSize)
        // both render/measure respecting that tag, so what's ON SCREEN
        // is correctly oriented. But expo-image-manipulator's `crop`
        // action operates on the RAW un-rotated buffer underneath —
        // originX/originY computed from the on-screen (rotated) box
        // therefore land in the wrong place once reinterpreted against
        // the unrotated buffer, which is exactly what "always grabs the
        // top-left corner instead of the selected area" looks like.
        //
        // Fix: run the raw capture through manipulateAsync with NO
        // transform actions. The library still fully decodes and
        // re-encodes the image to do this, which bakes the EXIF rotation
        // into the actual pixel data and resets the orientation tag —
        // there is now only ONE coordinate space, and it's the same one
        // this result's own width/height describe. Using THIS call's
        // returned width/height (not a separate Image.getSize call) is
        // what guarantees the crop math below and the actual crop action
        // are always talking about the exact same buffer.
        const normalized = await manipulateAsync(params.uri, [], { format: SaveFormat.JPEG });
        if (cancelled) return;

        setNormalizedUri(normalized.uri);
        setImgSize({ width: normalized.width, height: normalized.height });

        const screen = Dimensions.get("window");
        const maxW = screen.width - 32;
        const maxH = screen.height * 0.6;
        let dispW = maxW;
        let dispH = dispW * (normalized.height / normalized.width);
        if (dispH > maxH) {
          dispH = maxH;
          dispW = dispH * (normalized.width / normalized.height);
        }
        setLayout({ dispW, dispH });
        const marginX = dispW * 0.08;
        const marginY = dispH * 0.08;
        setCropBoth({
          x: marginX,
          y: marginY,
          width: dispW - marginX * 2,
          height: dispH - marginY * 2,
        });
      } catch (err) {
        if (!cancelled) {
          console.log("[crop] failed to normalize orientation", err instanceof Error ? err.message : String(err));
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.uri]);

  const clampRect = (r: Rect, dispW: number, dispH: number): Rect => {
    const width = Math.min(Math.max(r.width, MIN_CROP_SIZE), dispW);
    const height = Math.min(Math.max(r.height, MIN_CROP_SIZE), dispH);
    const x = Math.min(Math.max(r.x, 0), dispW - width);
    const y = Math.min(Math.max(r.y, 0), dispH - height);
    return { x, y, width, height };
  };

  const bodyPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = cropRef.current;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!dragStart.current || !layout) return;
          const next = clampRect(
            { ...dragStart.current, x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy },
            layout.dispW,
            layout.dispH
          );
          setCropBoth(next);
        },
      }),
    [layout]
  );

  const cornerPanResponder = (corner: Corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = cropRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (!dragStart.current || !layout) return;
        const start = dragStart.current;
        let { x, y, width, height } = start;

        if (corner === "br") {
          width = start.width + gesture.dx;
          height = start.height + gesture.dy;
        } else if (corner === "bl") {
          x = start.x + gesture.dx;
          width = start.width - gesture.dx;
          height = start.height + gesture.dy;
        } else if (corner === "tr") {
          y = start.y + gesture.dy;
          width = start.width + gesture.dx;
          height = start.height - gesture.dy;
        } else {
          x = start.x + gesture.dx;
          y = start.y + gesture.dy;
          width = start.width - gesture.dx;
          height = start.height - gesture.dy;
        }

        // Clamp size before position so a corner dragged past its
        // opposite edge stops at MIN_CROP_SIZE instead of flipping
        // negative — clampRect alone can't fix that since it clamps x/y
        // against the ALREADY-shrunk width, not the pre-drag anchor.
        width = Math.max(width, MIN_CROP_SIZE);
        height = Math.max(height, MIN_CROP_SIZE);
        if (corner === "bl" || corner === "tl") x = start.x + start.width - width;
        if (corner === "tl" || corner === "tr") y = start.y + start.height - height;

        setCropBoth(clampRect({ x, y, width, height }, layout.dispW, layout.dispH));
      },
    });

  const handles = useMemo(
    () => ({
      tl: cornerPanResponder("tl"),
      tr: cornerPanResponder("tr"),
      bl: cornerPanResponder("bl"),
      br: cornerPanResponder("br"),
    }),
    [layout]
  );

  const confirmCrop = async () => {
    if (!crop || !layout || !imgSize || !normalizedUri) return;
    setSaving(true);
    try {
      const scaleX = imgSize.width / layout.dispW;
      const scaleY = imgSize.height / layout.dispH;
      const pixelCrop = {
        originX: Math.round(crop.x * scaleX),
        originY: Math.round(crop.y * scaleY),
        width: Math.round(crop.width * scaleX),
        height: Math.round(crop.height * scaleY),
      };
      // normalizedUri, not params.uri — the orientation-normalized file
      // from the effect above. imgSize/layout were both derived from
      // THIS file, so pixelCrop is only valid against this same file;
      // passing the original params.uri here would silently reintroduce
      // the exact bug this screen exists to fix.
      const finalUri = await cropAndOptimizeNozzlePhoto(normalizedUri, pixelCrop);
      emitCrop(finalUri);
      navigation.goBack();
    } catch (err) {
      // Left on-screen rather than an Alert — the crop rect (and the
      // technician's work positioning it) stays intact so they can just
      // tap "Use This Area" again instead of starting the whole capture
      // over.
      console.log("[crop] failed to crop/optimize", err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Couldn't load that photo. Go back and try capturing it again.</Text>
        <Pressable style={[styles.secondaryButton, { marginTop: 16 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!layout || !crop || !normalizedUri) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Drag the box over just the nozzle-check portion</Text>
      <View style={[styles.imageWrap, { width: layout.dispW, height: layout.dispH }]}>
        <Image source={{ uri: normalizedUri }} style={{ width: layout.dispW, height: layout.dispH }} />
        {/* Dimmed strips outside the crop rect — top/bottom/left/right,
            rather than a single overlay with a punched-out hole (no clip-
            path equivalent in RN StyleSheet without a masking library). */}
        <View style={[styles.dim, { top: 0, left: 0, right: 0, height: crop.y }]} />
        <View
          style={[styles.dim, { top: crop.y + crop.height, left: 0, right: 0, bottom: 0 }]}
        />
        <View style={[styles.dim, { top: crop.y, left: 0, width: crop.x, height: crop.height }]} />
        <View
          style={[
            styles.dim,
            { top: crop.y, left: crop.x + crop.width, right: 0, height: crop.height },
          ]}
        />
        <View
          {...bodyPanResponder.panHandlers}
          style={[styles.cropBox, { left: crop.x, top: crop.y, width: crop.width, height: crop.height }]}
        />
        {(["tl", "tr", "bl", "br"] as Corner[]).map((corner) => {
          const isTop = corner === "tl" || corner === "tr";
          const isLeft = corner === "tl" || corner === "bl";
          return (
            <View
              key={corner}
              {...handles[corner].panHandlers}
              style={[
                styles.handle,
                {
                  left: crop.x + (isLeft ? -HANDLE_SIZE / 2 : crop.width - HANDLE_SIZE / 2),
                  top: crop.y + (isTop ? -HANDLE_SIZE / 2 : crop.height - HANDLE_SIZE / 2),
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={confirmCrop} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? "Processing…" : "Use This Area"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, alignItems: "center", padding: 16 },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background },
    title: { color: theme.foreground, fontSize: 14, fontWeight: "600", marginBottom: 12, textAlign: "center" },
    imageWrap: { position: "relative", backgroundColor: "#000" },
    dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
    cropBox: { position: "absolute", borderWidth: 2, borderColor: theme.primary },
    handle: {
      position: "absolute",
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      borderRadius: HANDLE_SIZE / 2,
      backgroundColor: theme.primary,
      borderWidth: 2,
      borderColor: "#fff",
    },
    buttonRow: { flexDirection: "row", gap: 12, marginTop: 24, width: "100%" },
    secondaryButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },
    primaryButton: {
      flex: 1,
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
    },
    primaryButtonText: { color: theme.primaryForeground, fontWeight: "700" },
  });
}
