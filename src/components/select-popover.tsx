import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "./ui";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function SelectPopover<Code extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  alignment = "start",
}: {
  label: string;
  options: readonly { code: Code; label: string }[];
  value: Code;
  onChange: (code: Code) => void;
  disabled?: boolean;
  alignment?: "start" | "end";
}) {
  const triggerRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Bounds | null>(null);
  const [overlay, setOverlay] = useState<Bounds | null>(null);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selectedLabel = options.find((option) => option.code === value)?.label;

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      setAnchor(null);
    });
    return () => subscription.remove();
  }, []);

  if (disabled && anchor) setAnchor(null);

  function close() {
    setAnchor(null);
  }

  let placement;
  if (anchor && overlay) {
    // Both measurements use window coordinates; subtract the modal's origin
    // so system bars do not shift the menu on either platform.
    const left = Math.max(8, insets.left - overlay.x + 8);
    const right = Math.min(
      overlay.width - 8,
      window.width - insets.right - overlay.x - 8,
    );
    const top = Math.max(8, insets.top - overlay.y + 8);
    const bottom = Math.min(
      overlay.height - 8,
      window.height - insets.bottom - overlay.y - 8,
    );
    const anchorTop = anchor.y - overlay.y;
    const belowTop = anchorTop + anchor.height + 6;
    const below = Math.max(0, bottom - belowTop);
    const above = Math.max(0, anchorTop - 6 - top);
    const preferredHeight = Math.min(
      320,
      options.length * Math.max(44, 22 * window.fontScale + 20) + 10,
    );
    const openBelow = below >= preferredHeight || below >= above;
    const maxHeight = Math.min(320, openBelow ? below : above);
    const width = Math.min(176, right - left);
    const anchorLeft =
      anchor.x - overlay.x + (alignment === "end" ? anchor.width - width : 0);
    placement = {
      left: Math.max(left, Math.min(anchorLeft, right - width)),
      width,
      maxHeight,
      ...(openBelow
        ? { top: belowTop }
        : { bottom: overlay.height - anchorTop + 6 }),
    };
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selectedLabel}`}
        accessibilityState={{ expanded: anchor !== null, disabled }}
        disabled={disabled}
        onPress={() => {
          setOverlay(null);
          triggerRef.current?.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) setAnchor({ x, y, width, height });
          });
        }}
        style={({ pressed }) => [
          styles.triggerTouch,
          (pressed || disabled) && { opacity: 0.5 },
        ]}
      >
        <View ref={triggerRef} collapsable={false} style={styles.trigger}>
          <Text style={styles.triggerLabel}>{selectedLabel}</Text>
          <Ionicons
            name={anchor ? "chevron-up" : "chevron-down"}
            size={13}
            color={colors.muted}
          />
        </View>
      </Pressable>
      <Modal
        visible={anchor !== null && !disabled}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
        supportedOrientations={["portrait", "landscape"]}
      >
        <View
          ref={overlayRef}
          style={styles.overlay}
          onLayout={() => {
            overlayRef.current?.measureInWindow((x, y, width, height) => {
              setOverlay({ x, y, width, height });
            });
          }}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`${label} 닫기`}
            onPress={close}
          />
          {placement && (
            <View
              accessibilityViewIsModal
              accessibilityRole="menu"
              accessibilityLabel={label}
              onAccessibilityEscape={close}
              style={[styles.menu, placement]}
            >
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.options}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {options.map((option) => (
                  <Pressable
                    key={option.code}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: option.code === value }}
                    onPress={() => {
                      close();
                      onChange(option.code);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      option.code === value && styles.selected,
                      pressed && { backgroundColor: colors.bg },
                    ]}
                  >
                    <View style={styles.check}>
                      {option.code === value && (
                        <Ionicons
                          name="checkmark"
                          size={19}
                          color={colors.blue}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        option.code === value && styles.selectedLabel,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  triggerTouch: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  trigger: {
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
  },
  triggerLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  menu: {
    position: "absolute",
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.ink,
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  scroll: { flexGrow: 0, flexShrink: 1, borderRadius: 11 },
  options: { padding: 4 },
  option: {
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
  },
  selected: { backgroundColor: colors.softBlue },
  check: { width: 20, alignItems: "center" },
  optionLabel: { flex: 1, fontSize: 14, lineHeight: 22, color: colors.ink },
  selectedLabel: { color: colors.blue, fontWeight: "600" },
});
